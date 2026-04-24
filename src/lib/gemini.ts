import { GoogleGenAI, Modality } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface VoiceProfile {
  id: string;
  name: string;
  description: string;
  voiceName: 'Kore' | 'Puck' | 'Fenrir' | 'Charon';
  style: string;
  emoji: string;
}

export const VOICE_PROFILES: VoiceProfile[] = [
  {
    id: 'ayesha',
    name: 'Ayesha',
    description: 'Soft Emotional • Tale',
    voiceName: 'Kore',
    style: 'soft, emotional, and dramatic',
    emoji: '🐚'
  },
  {
    id: 'joy',
    name: 'Joy',
    description: 'Warm Friendly • Narrative',
    voiceName: 'Charon',
    style: 'warm, friendly, and narrative',
    emoji: '☀️'
  },
  {
    id: 'pori',
    name: 'Pori',
    description: 'Playful Child • Whimsical',
    voiceName: 'Puck',
    style: 'playful, high-pitched, and whimsical',
    emoji: '🧚'
  },
  {
    id: 'rudra',
    name: 'Rudra',
    description: 'Deep Serious • Epic',
    voiceName: 'Fenrir',
    style: 'deep, serious, and epic',
    emoji: '⛰️'
  }
];

export async function generateStoryAudio(text: string, voice: VoiceProfile, speed: number = 0.9, pitch: 'low' | 'medium' | 'high' = 'medium', intensity: number = 80, customInstructions: string = '', backgroundMusic: boolean = false, variation: string = 'neutral', ambiance: string = 'none') {
  const prompt = `You are a professional Bengali storyteller. 
TTS the following story snippet with a ${voice.style} voice.
The vocal mood/variation should be ${variation}.
Deliver at a ${pitch} pitch.
The emotional intensity should be ${intensity}% (where 0% is subtle/monotone and 100% is highly dramatic/theatrical).
Pace the delivery at speed ${speed}. 
Keep the delivery natural for Bengali narration.
Add natural pauses after lines for dramatic storytelling effect.
Interpret markdown markers: **bold** text should be emphasized or spoken with more weight, *italics* should be spoken with a softer or more emotional tone, and _underlined_ text should be spoken slightly slower for importance.
${backgroundMusic ? 'Include atmospheric, cinematic Bengali folk-style background music that complements the story.' : 'There should be no background music, only the voice narration.'}
${ambiance !== 'none' ? `Incorporate the acoustic ambiance of a ${ambiance} into the recording.` : ''}
${customInstructions ? `Additional narrative instructions: ${customInstructions}` : ''}

STORY:
${text}`;

  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-tts-preview",
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: voice.voiceName },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  return base64Audio;
}
