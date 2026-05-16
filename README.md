# Cicerone

The first orientation-aware, conversational voice guide for cities. You walk, you turn, the narration follows. You interrupt your guide Emma mid-sentence, she stops, answers, picks up where she left off.


Website: https://hackaton-ultimate-audio-guide-git-frontend-elegarys-projects.vercel.app/

## Why
Right after the Big Berlin Hack, we spent two weeks travelling across Europe. And we kept hitting the same wall: figuring out what we were actually looking at. Scrolling TikTok for hidden spots, skimming Google Maps reviews, pinging ChatGPT about some monument we'd just walked past. None of it felt like having a friend with you.
So we built Cicerone. The closest thing to an actual human guide in your pocket.
Audio guides know where you are. None know where you're looking, and none let you talk back. Cicerone does both. The phone's compass drives the narration in real time, and Gradium's full-duplex pipeline lets you cut in mid-sentence, ask, get an answer, and pick up where you left off. Emma talks about the café on your right or the gallery that just opened, not only monuments. Because a city is never only its landmarks.

## How it works

Thin Next.js frontend captures position, heading and audio, then executes UI commands pushed by the backend over a WebSocket. The Python backend holds all the logic: a Gradium AgentSession wraps STT, GPT-4o and TTS with native barge-in, and exposes tools for Google Places, Wikipedia, Wikidata and Tavily. Audio is full-duplex over WebRTC. No database, session state lives in memory.

## Stack

Frontend: Next.js 14, TypeScript, Tailwind, Zustand, Google Maps JS SDK, WebSocket, WebRTC. Hosted on Vercel (cdg1).

Backend: FastAPI, Gradium SDK, OpenAI GPT-4o, httpx. Hosted on Railway (eu-west).

Data: Google Places API (New), Wikipedia REST, Wikidata SPARQL, Tavily.

## Run locally

Frontend:

    npm install
    cp .env.local.example .env.local
    # fill NEXT_PUBLIC_BACKEND_WS_URL and NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    npm run dev

Backend:

    python -m venv venv && source venv/bin/activate
    pip install -r requirements.txt
    cp .env.example .env
    # fill OPENAI_API_KEY, GRADIUM_API_KEY, GOOGLE_MAPS_API_KEY, TAVILY_API_KEY
    uvicorn main:app --reload

Open the frontend on a phone via HTTPS (Vercel preview works) so compass and microphone permissions are granted.

## Team

Romain Caussignac 
https://www.linkedin.com/in/romain-caussignac/
Raphaël Bellepeau
https://www.linkedin.com/in/raphael-bellepeau/
## License

MIT.
