from fastapi import FastAPI, APIRouter, HTTPException, Request, Header, Response, UploadFile, File
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import base64
import io
from emergentintegrations.llm.chat import LlmChat, UserMessage
from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionResponse, CheckoutStatusResponse, CheckoutSessionRequest

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Environment variables
EMERGENT_LLM_KEY = os.environ['EMERGENT_LLM_KEY']
STRIPE_API_KEY = os.environ['STRIPE_API_KEY']

# Subscription Plans Configuration
PLANS = {
    "free": {
        "name": "Free",
        "price": 0,
        "currency": "inr",
        "text_generations": 10,
        "image_generations": 2,
        "voice_queries": 5,
        "photo_searches": 3,
        "deep_research": 0
    },
    "go": {
        "name": "Go",
        "price": 200.00,
        "currency": "inr",
        "stripe_price_id": None,  # Will use custom amount
        "text_generations": 500,
        "image_generations": 50,
        "voice_queries": 200,
        "photo_searches": 100,
        "deep_research": 20
    },
    "pro": {
        "name": "Pro",
        "price": 400.00,
        "currency": "inr",
        "stripe_price_id": None,  # Will use custom amount
        "text_generations": -1,  # unlimited
        "image_generations": 200,
        "voice_queries": -1,  # unlimited
        "photo_searches": -1,  # unlimited
        "deep_research": -1  # unlimited
    }
}

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# ==================== PYDANTIC MODELS ====================

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    subscription_plan: str = "free"
    subscription_status: str = "active"
    created_at: datetime

class UserSession(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    session_token: str
    expires_at: datetime
    created_at: datetime

class Conversation(BaseModel):
    model_config = ConfigDict(extra="ignore")
    conversation_id: str
    user_id: str
    title: str
    created_at: datetime
    updated_at: datetime

class Message(BaseModel):
    model_config = ConfigDict(extra="ignore")
    message_id: str
    conversation_id: str
    user_id: str
    role: str  # "user" or "assistant"
    content: str
    images: Optional[List[str]] = None
    created_at: datetime

class PaymentTransaction(BaseModel):
    model_config = ConfigDict(extra="ignore")
    transaction_id: str
    user_id: str
    session_id: str
    amount: float
    currency: str
    plan_type: str
    payment_status: str
    created_at: datetime
    updated_at: Optional[datetime] = None

class UsageStats(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    plan: str
    text_generations: int = 0
    image_generations: int = 0
    voice_queries: int = 0
    photo_searches: int = 0
    deep_research: int = 0
    reset_date: datetime

# Request/Response Models
class SessionExchangeRequest(BaseModel):
    session_id: str

class ChatRequest(BaseModel):
    conversation_id: Optional[str] = None
    message: str
    mode: str = "chat"  # "chat", "deep_research"

class ImageGenerationRequest(BaseModel):
    prompt: str
    conversation_id: Optional[str] = None

class VoiceTranscribeRequest(BaseModel):
    conversation_id: Optional[str] = None

class VoiceSynthesizeRequest(BaseModel):
    text: str

class PhotoSearchRequest(BaseModel):
    question: str
    conversation_id: Optional[str] = None

class CheckoutRequest(BaseModel):
    plan_id: str
    origin_url: str

# ==================== HELPER FUNCTIONS ====================

async def get_user_from_token(token: Optional[str] = None, cookie_token: Optional[str] = None) -> User:
    """Extract and verify user from session token (cookie or header)."""
    session_token = cookie_token or token
    
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Find session
    session_doc = await db.user_sessions.find_one(
        {"session_token": session_token},
        {"_id": 0}
    )
    
    if not session_doc:
        raise HTTPException(status_code=401, detail="Invalid session")
    
    # Check expiry
    expires_at = session_doc["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")
    
    # Get user
    user_doc = await db.users.find_one(
        {"user_id": session_doc["user_id"]},
        {"_id": 0}
    )
    
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Convert datetime strings
    if isinstance(user_doc.get('created_at'), str):
        user_doc['created_at'] = datetime.fromisoformat(user_doc['created_at'])
    
    return User(**user_doc)

async def check_and_increment_usage(user_id: str, usage_type: str) -> bool:
    """Check if user has remaining quota and increment usage."""
    # Get or create usage stats
    usage_doc = await db.usage_stats.find_one(
        {"user_id": user_id},
        {"_id": 0}
    )
    
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    plan = user_doc.get("subscription_plan", "free")
    plan_limits = PLANS[plan]
    
    if not usage_doc:
        # Create new usage stats
        usage_doc = {
            "user_id": user_id,
            "plan": plan,
            "text_generations": 0,
            "image_generations": 0,
            "voice_queries": 0,
            "photo_searches": 0,
            "deep_research": 0,
            "reset_date": datetime.now(timezone.utc) + timedelta(days=30)
        }
        await db.usage_stats.insert_one(usage_doc)
    
    # Check if reset needed
    reset_date = usage_doc["reset_date"]
    if isinstance(reset_date, str):
        reset_date = datetime.fromisoformat(reset_date)
    if reset_date.tzinfo is None:
        reset_date = reset_date.replace(tzinfo=timezone.utc)
    
    if reset_date < datetime.now(timezone.utc):
        # Reset usage
        await db.usage_stats.update_one(
            {"user_id": user_id},
            {"$set": {
                "text_generations": 0,
                "image_generations": 0,
                "voice_queries": 0,
                "photo_searches": 0,
                "deep_research": 0,
                "reset_date": datetime.now(timezone.utc) + timedelta(days=30)
            }}
        )
        usage_doc = await db.usage_stats.find_one({"user_id": user_id}, {"_id": 0})
    
    # Check limit
    current_usage = usage_doc.get(usage_type, 0)
    limit = plan_limits.get(usage_type, 0)
    
    if limit != -1 and current_usage >= limit:
        return False
    
    # Increment usage
    await db.usage_stats.update_one(
        {"user_id": user_id},
        {"$inc": {usage_type: 1}}
    )
    
    return True

# ==================== AUTHENTICATION ENDPOINTS ====================

@api_router.post("/auth/session")
async def exchange_session(request: SessionExchangeRequest, response: Response):
    """Exchange session_id from OAuth callback for user data and session token."""
    import aiohttp
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": request.session_id}
            ) as resp:
                if resp.status != 200:
                    raise HTTPException(status_code=400, detail="Invalid session ID")
                
                data = await resp.json()
        
        # Check if user exists
        user_doc = await db.users.find_one(
            {"email": data["email"]},
            {"_id": 0}
        )
        
        if user_doc:
            user_id = user_doc["user_id"]
            # Update user data
            await db.users.update_one(
                {"user_id": user_id},
                {"$set": {
                    "name": data["name"],
                    "picture": data.get("picture")
                }}
            )
        else:
            # Create new user
            user_id = f"user_{uuid.uuid4().hex[:12]}"
            user_data = {
                "user_id": user_id,
                "email": data["email"],
                "name": data["name"],
                "picture": data.get("picture"),
                "subscription_plan": "free",
                "subscription_status": "active",
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.users.insert_one(user_data)
            
            # Create initial usage stats
            usage_data = {
                "user_id": user_id,
                "plan": "free",
                "text_generations": 0,
                "image_generations": 0,
                "voice_queries": 0,
                "photo_searches": 0,
                "deep_research": 0,
                "reset_date": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
            }
            await db.usage_stats.insert_one(usage_data)
        
        # Create session
        session_token = data["session_token"]
        expires_at = datetime.now(timezone.utc) + timedelta(days=7)
        
        session_data = {
            "user_id": user_id,
            "session_token": session_token,
            "expires_at": expires_at.isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        # Delete old sessions for this user
        await db.user_sessions.delete_many({"user_id": user_id})
        await db.user_sessions.insert_one(session_data)
        
        # Set cookie
        response.set_cookie(
            key="session_token",
            value=session_token,
            httponly=True,
            secure=True,
            samesite="none",
            path="/",
            max_age=7*24*60*60
        )
        
        # Get user data
        user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
        
        return {
            "user": user_doc,
            "session_token": session_token
        }
    
    except Exception as e:
        logging.error(f"Session exchange error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/auth/me")
async def get_current_user(
    request: Request,
    authorization: Optional[str] = Header(None)
):
    """Get current authenticated user."""
    cookie_token = request.cookies.get("session_token")
    header_token = authorization.replace("Bearer ", "") if authorization else None
    
    user = await get_user_from_token(token=header_token, cookie_token=cookie_token)
    
    # Get usage stats
    usage_doc = await db.usage_stats.find_one({"user_id": user.user_id}, {"_id": 0})
    
    return {
        "user": user.model_dump(),
        "usage": usage_doc
    }

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    """Logout user and clear session."""
    cookie_token = request.cookies.get("session_token")
    
    if cookie_token:
        await db.user_sessions.delete_one({"session_token": cookie_token})
    
    response.delete_cookie(key="session_token", path="/")
    
    return {"message": "Logged out successfully"}

# ==================== CHAT ENDPOINTS ====================

@api_router.post("/chat/completions")
async def chat_completion(
    chat_req: ChatRequest,
    request: Request,
    authorization: Optional[str] = Header(None)
):
    """Handle chat completions with GPT-5.2."""
    cookie_token = request.cookies.get("session_token")
    header_token = authorization.replace("Bearer ", "") if authorization else None
    user = await get_user_from_token(token=header_token, cookie_token=cookie_token)
    
    # Check usage limit
    usage_type = "deep_research" if chat_req.mode == "deep_research" else "text_generations"
    if not await check_and_increment_usage(user.user_id, usage_type):
        raise HTTPException(status_code=429, detail=f"Usage limit exceeded for {usage_type}")
    
    # Get or create conversation
    conversation_id = chat_req.conversation_id
    if not conversation_id:
        conversation_id = f"conv_{uuid.uuid4().hex[:12]}"
        conv_data = {
            "conversation_id": conversation_id,
            "user_id": user.user_id,
            "title": chat_req.message[:50] + "...",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        await db.conversations.insert_one(conv_data)
    
    # Save user message
    user_msg_data = {
        "message_id": f"msg_{uuid.uuid4().hex[:12]}",
        "conversation_id": conversation_id,
        "user_id": user.user_id,
        "role": "user",
        "content": chat_req.message,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.messages.insert_one(user_msg_data)
    
    # Get conversation history (last 20 messages)
    messages = await db.messages.find(
        {"conversation_id": conversation_id},
        {"_id": 0}
    ).sort("created_at", 1).limit(20).to_list(20)
    
    # Build system message
    system_message = "You are Ankit GPT 2.0, an advanced AI assistant created to help users with questions, research, and problem-solving."
    if chat_req.mode == "deep_research":
        system_message += " You are in Deep Research mode. Provide comprehensive, well-researched answers with detailed explanations."
    
    # Initialize LLM chat
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=conversation_id,
        system_message=system_message
    ).with_model("openai", "gpt-5.2")
    
    # Send message
    user_message = UserMessage(text=chat_req.message)
    response_text = await chat.send_message(user_message)
    
    # Save assistant message
    assistant_msg_data = {
        "message_id": f"msg_{uuid.uuid4().hex[:12]}",
        "conversation_id": conversation_id,
        "user_id": user.user_id,
        "role": "assistant",
        "content": response_text,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.messages.insert_one(assistant_msg_data)
    
    # Update conversation
    await db.conversations.update_one(
        {"conversation_id": conversation_id},
        {"$set": {"updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {
        "conversation_id": conversation_id,
        "response": response_text,
        "message_id": assistant_msg_data["message_id"]
    }

@api_router.post("/chat/vision")
async def vision_analysis(
    request: Request,
    authorization: Optional[str] = Header(None),
    image: UploadFile = File(...),
    question: str = "",
    conversation_id: Optional[str] = None
):
    """Analyze image with GPT-5.2 Vision (Photo Search mode)."""
    cookie_token = request.cookies.get("session_token")
    header_token = authorization.replace("Bearer ", "") if authorization else None
    user = await get_user_from_token(token=header_token, cookie_token=cookie_token)
    
    # Check usage limit
    if not await check_and_increment_usage(user.user_id, "photo_searches"):
        raise HTTPException(status_code=429, detail="Usage limit exceeded for photo searches")
    
    # Read image
    image_bytes = await image.read()
    image_base64 = base64.b64encode(image_bytes).decode('utf-8')
    
    # Get or create conversation
    if not conversation_id:
        conversation_id = f"conv_{uuid.uuid4().hex[:12]}"
        conv_data = {
            "conversation_id": conversation_id,
            "user_id": user.user_id,
            "title": f"Photo Search: {question[:30]}...",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        await db.conversations.insert_one(conv_data)
    
    # Initialize LLM chat with vision
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=conversation_id,
        system_message="You are Ankit GPT 2.0 in Photo Search mode. Analyze images and answer questions about them in detail."
    ).with_model("openai", "gpt-5.2")
    
    # Create message with image
    from emergentintegrations.llm.chat import Image
    user_message = UserMessage(
        text=question or "What's in this image?",
        images=[Image(base64=image_base64)]
    )
    
    response_text = await chat.send_message(user_message)
    
    # Save messages
    user_msg_data = {
        "message_id": f"msg_{uuid.uuid4().hex[:12]}",
        "conversation_id": conversation_id,
        "user_id": user.user_id,
        "role": "user",
        "content": question or "What's in this image?",
        "images": [image_base64],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.messages.insert_one(user_msg_data)
    
    assistant_msg_data = {
        "message_id": f"msg_{uuid.uuid4().hex[:12]}",
        "conversation_id": conversation_id,
        "user_id": user.user_id,
        "role": "assistant",
        "content": response_text,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.messages.insert_one(assistant_msg_data)
    
    return {
        "conversation_id": conversation_id,
        "response": response_text
    }

# ==================== IMAGE GENERATION ENDPOINT ====================

@api_router.post("/images/generate")
async def generate_image(
    img_req: ImageGenerationRequest,
    request: Request,
    authorization: Optional[str] = Header(None)
):
    """Generate image using OpenAI GPT Image 1."""
    cookie_token = request.cookies.get("session_token")
    header_token = authorization.replace("Bearer ", "") if authorization else None
    user = await get_user_from_token(token=header_token, cookie_token=cookie_token)
    
    # Check usage limit
    if not await check_and_increment_usage(user.user_id, "image_generations"):
        raise HTTPException(status_code=429, detail="Usage limit exceeded for image generations")
    
    # Generate image using OpenAI
    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=EMERGENT_LLM_KEY)
    
    try:
        response = await client.images.generate(
            model="gpt-image-1",
            prompt=img_req.prompt,
            size="1024x1024",
            quality="standard",
            n=1,
        )
        
        image_url = response.data[0].url
        
        # Get or create conversation if provided
        conversation_id = img_req.conversation_id
        if conversation_id:
            # Save to conversation
            user_msg_data = {
                "message_id": f"msg_{uuid.uuid4().hex[:12]}",
                "conversation_id": conversation_id,
                "user_id": user.user_id,
                "role": "user",
                "content": f"Generate image: {img_req.prompt}",
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.messages.insert_one(user_msg_data)
            
            assistant_msg_data = {
                "message_id": f"msg_{uuid.uuid4().hex[:12]}",
                "conversation_id": conversation_id,
                "user_id": user.user_id,
                "role": "assistant",
                "content": f"![Generated Image]({image_url})",
                "images": [image_url],
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.messages.insert_one(assistant_msg_data)
        
        return {
            "image_url": image_url,
            "conversation_id": conversation_id
        }
    
    except Exception as e:
        logging.error(f"Image generation error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ==================== VOICE ENDPOINTS ====================

@api_router.post("/voice/transcribe")
async def transcribe_audio(
    request: Request,
    authorization: Optional[str] = Header(None),
    audio: UploadFile = File(...)
):
    """Transcribe audio using OpenAI Whisper."""
    cookie_token = request.cookies.get("session_token")
    header_token = authorization.replace("Bearer ", "") if authorization else None
    user = await get_user_from_token(token=header_token, cookie_token=cookie_token)
    
    # Check usage limit
    if not await check_and_increment_usage(user.user_id, "voice_queries"):
        raise HTTPException(status_code=429, detail="Usage limit exceeded for voice queries")
    
    # Transcribe using Whisper
    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=EMERGENT_LLM_KEY)
    
    try:
        audio_bytes = await audio.read()
        
        # Create a file-like object
        audio_file = io.BytesIO(audio_bytes)
        audio_file.name = audio.filename or "audio.webm"
        
        transcription = await client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file
        )
        
        return {
            "text": transcription.text
        }
    
    except Exception as e:
        logging.error(f"Transcription error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/voice/synthesize")
async def synthesize_speech(
    voice_req: VoiceSynthesizeRequest,
    request: Request,
    authorization: Optional[str] = Header(None)
):
    """Convert text to speech using OpenAI TTS."""
    cookie_token = request.cookies.get("session_token")
    header_token = authorization.replace("Bearer ", "") if authorization else None
    user = await get_user_from_token(token=header_token, cookie_token=cookie_token)
    
    # Synthesize speech
    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=EMERGENT_LLM_KEY)
    
    try:
        response = await client.audio.speech.create(
            model="tts-1",
            voice="alloy",
            input=voice_req.text
        )
        
        # Stream the audio
        audio_data = response.content
        
        return Response(
            content=audio_data,
            media_type="audio/mpeg",
            headers={
                "Content-Disposition": "attachment; filename=speech.mp3"
            }
        )
    
    except Exception as e:
        logging.error(f"TTS error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ==================== CONVERSATION ENDPOINTS ====================

@api_router.get("/conversations")
async def get_conversations(
    request: Request,
    authorization: Optional[str] = Header(None)
):
    """Get all conversations for current user."""
    cookie_token = request.cookies.get("session_token")
    header_token = authorization.replace("Bearer ", "") if authorization else None
    user = await get_user_from_token(token=header_token, cookie_token=cookie_token)
    
    conversations = await db.conversations.find(
        {"user_id": user.user_id},
        {"_id": 0}
    ).sort("updated_at", -1).to_list(100)
    
    return {"conversations": conversations}

@api_router.get("/conversations/{conversation_id}")
async def get_conversation(
    conversation_id: str,
    request: Request,
    authorization: Optional[str] = Header(None)
):
    """Get conversation with messages."""
    cookie_token = request.cookies.get("session_token")
    header_token = authorization.replace("Bearer ", "") if authorization else None
    user = await get_user_from_token(token=header_token, cookie_token=cookie_token)
    
    conversation = await db.conversations.find_one(
        {"conversation_id": conversation_id, "user_id": user.user_id},
        {"_id": 0}
    )
    
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    messages = await db.messages.find(
        {"conversation_id": conversation_id},
        {"_id": 0}
    ).sort("created_at", 1).to_list(1000)
    
    return {
        "conversation": conversation,
        "messages": messages
    }

@api_router.delete("/conversations/{conversation_id}")
async def delete_conversation(
    conversation_id: str,
    request: Request,
    authorization: Optional[str] = Header(None)
):
    """Delete conversation and its messages."""
    cookie_token = request.cookies.get("session_token")
    header_token = authorization.replace("Bearer ", "") if authorization else None
    user = await get_user_from_token(token=header_token, cookie_token=cookie_token)
    
    # Delete conversation
    result = await db.conversations.delete_one({
        "conversation_id": conversation_id,
        "user_id": user.user_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    # Delete messages
    await db.messages.delete_many({"conversation_id": conversation_id})
    
    return {"message": "Conversation deleted"}

@api_router.post("/conversations")
async def create_conversation(
    request: Request,
    authorization: Optional[str] = Header(None)
):
    """Create a new conversation."""
    cookie_token = request.cookies.get("session_token")
    header_token = authorization.replace("Bearer ", "") if authorization else None
    user = await get_user_from_token(token=header_token, cookie_token=cookie_token)
    
    conversation_id = f"conv_{uuid.uuid4().hex[:12]}"
    conv_data = {
        "conversation_id": conversation_id,
        "user_id": user.user_id,
        "title": "New Conversation",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    await db.conversations.insert_one(conv_data)
    
    return {"conversation_id": conversation_id}

# ==================== PAYMENT ENDPOINTS ====================

@api_router.post("/payments/create-checkout")
async def create_checkout(
    checkout_req: CheckoutRequest,
    http_request: Request,
    authorization: Optional[str] = Header(None)
):
    """Create Stripe checkout session for subscription plan."""
    cookie_token = http_request.cookies.get("session_token")
    header_token = authorization.replace("Bearer ", "") if authorization else None
    user = await get_user_from_token(token=header_token, cookie_token=cookie_token)
    
    # Validate plan
    if checkout_req.plan_id not in PLANS:
        raise HTTPException(status_code=400, detail="Invalid plan")
    
    plan = PLANS[checkout_req.plan_id]
    
    if plan["price"] == 0:
        raise HTTPException(status_code=400, detail="Free plan doesn't require payment")
    
    # Initialize Stripe
    host_url = checkout_req.origin_url
    webhook_url = f"{http_request.base_url}api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
    
    # Create checkout session
    success_url = f"{host_url}/dashboard?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{host_url}/pricing"
    
    checkout_request = CheckoutSessionRequest(
        amount=plan["price"],
        currency=plan["currency"],
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={
            "user_id": user.user_id,
            "plan_id": checkout_req.plan_id,
            "plan_name": plan["name"]
        }
    )
    
    try:
        session = await stripe_checkout.create_checkout_session(checkout_request)
        
        # Create payment transaction record
        transaction_data = {
            "transaction_id": f"txn_{uuid.uuid4().hex[:12]}",
            "user_id": user.user_id,
            "session_id": session.session_id,
            "amount": plan["price"],
            "currency": plan["currency"],
            "plan_type": checkout_req.plan_id,
            "payment_status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        await db.payment_transactions.insert_one(transaction_data)
        
        return {
            "checkout_url": session.url,
            "session_id": session.session_id
        }
    
    except Exception as e:
        logging.error(f"Stripe checkout error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/payments/status/{session_id}")
async def get_payment_status(
    session_id: str,
    request: Request,
    authorization: Optional[str] = Header(None)
):
    """Get payment status for a checkout session."""
    cookie_token = request.cookies.get("session_token")
    header_token = authorization.replace("Bearer ", "") if authorization else None
    user = await get_user_from_token(token=header_token, cookie_token=cookie_token)
    
    # Check if already processed
    transaction = await db.payment_transactions.find_one(
        {"session_id": session_id, "user_id": user.user_id},
        {"_id": 0}
    )
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    # If already processed as paid, return immediately
    if transaction["payment_status"] == "paid":
        return {
            "status": "complete",
            "payment_status": "paid",
            "plan": transaction["plan_type"]
        }
    
    # Check with Stripe
    webhook_url = f"{request.base_url}api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
    
    try:
        status_response = await stripe_checkout.get_checkout_status(session_id)
        
        # Update transaction
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {
                "payment_status": status_response.payment_status,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        
        # If paid and not already upgraded, upgrade user
        if status_response.payment_status == "paid" and transaction["payment_status"] != "paid":
            plan_id = status_response.metadata.get("plan_id")
            
            await db.users.update_one(
                {"user_id": user.user_id},
                {"$set": {
                    "subscription_plan": plan_id,
                    "subscription_status": "active"
                }}
            )
            
            # Reset usage stats with new plan limits
            await db.usage_stats.update_one(
                {"user_id": user.user_id},
                {"$set": {
                    "plan": plan_id,
                    "text_generations": 0,
                    "image_generations": 0,
                    "voice_queries": 0,
                    "photo_searches": 0,
                    "deep_research": 0,
                    "reset_date": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
                }}
            )
        
        return {
            "status": status_response.status,
            "payment_status": status_response.payment_status,
            "plan": status_response.metadata.get("plan_id")
        }
    
    except Exception as e:
        logging.error(f"Payment status error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    """Handle Stripe webhooks."""
    body = await request.body()
    signature = request.headers.get("Stripe-Signature")
    
    webhook_url = f"{request.base_url}api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
    
    try:
        webhook_response = await stripe_checkout.handle_webhook(body, signature)
        
        logging.info(f"Webhook received: {webhook_response.event_type}")
        
        # Update transaction based on webhook
        if webhook_response.payment_status:
            await db.payment_transactions.update_one(
                {"session_id": webhook_response.session_id},
                {"$set": {
                    "payment_status": webhook_response.payment_status,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }}
            )
        
        return {"status": "success"}
    
    except Exception as e:
        logging.error(f"Webhook error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))

# ==================== USAGE ENDPOINT ====================

@api_router.get("/usage/stats")
async def get_usage_stats(
    request: Request,
    authorization: Optional[str] = Header(None)
):
    """Get usage statistics for current user."""
    cookie_token = request.cookies.get("session_token")
    header_token = authorization.replace("Bearer ", "") if authorization else None
    user = await get_user_from_token(token=header_token, cookie_token=cookie_token)
    
    usage_doc = await db.usage_stats.find_one({"user_id": user.user_id}, {"_id": 0})
    plan_limits = PLANS[user.subscription_plan]
    
    return {
        "usage": usage_doc,
        "limits": plan_limits
    }

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
