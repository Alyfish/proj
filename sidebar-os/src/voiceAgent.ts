// Simple chained voice agent helpers
// Pipeline: audio Blob -> transcribe (gpt-4o-transcribe) -> LLM (gpt-4.1) -> TTS (gpt-4o-mini-tts)

export type VoicePipelineResult = {
  transcript: string
  responseText: string
  audioUrl: string
}

const API_KEY = import.meta.env.VITE_OPENAI_API_KEY as string | undefined

const requireKey = () => {
  if (!API_KEY) throw new Error('Missing VITE_OPENAI_API_KEY')
  return API_KEY
}

export async function transcribe(blob: Blob): Promise<string> {
  const key = requireKey()
  const form = new FormData()
  // Prefer a webm container from MediaRecorder
  form.append('file', new File([blob], 'speech.webm', { type: blob.type || 'audio/webm' }))
  form.append('model', 'gpt-4o-transcribe')
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Transcribe failed: ${res.status} ${body.substring(0, 200)}`)
  }
  const data = await res.json()
  // API returns { text: string, ... }
  return data.text ?? ''
}

export async function complete(systemPrompt: string, userText: string): Promise<string> {
  const key = requireKey()
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'gpt-4.1',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userText },
      ],
      temperature: 0.6,
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Completion failed: ${res.status} ${body.substring(0, 200)}`)
  }
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}

export const DEFAULT_VOICE = 'sage'
export const DEFAULT_SYSTEM_PROMPT = `The assistant’s voice embodies calm intelligence and quiet confidence. Its tone is smooth, steady, and composed—never rushed, never uncertain. It speaks with measured clarity, each word deliberate yet natural, creating a sense of effortless authority. The delivery is warm but reserved, balancing professionalism with approachability. It reassures through precision: when explaining or advising, the voice sounds analytical and insightful, as though it has already thought three steps ahead.

This voice maintains a polite, respectful demeanor at all times, with subtle inflection that communicates attentiveness and empathy without over-dramatization. It avoids filler or unnecessary elaboration, instead favoring concise, well-structured sentences that get straight to the point. When offering guidance or analysis, it blends logic with composure, ensuring users feel grounded and understood.

The overall impression should be that of a trusted digital advisor—calm under pressure, emotionally balanced, and perpetually focused. Whether it’s delivering updates, answering questions, or handling complex tasks, it projects unwavering competence and quiet reassurance.

In essence, this voice should make you feel like you’re speaking to a thoughtful, unflappable partner: refined, analytical, courteous, and seamlessly human in rhythm and tone.`

export async function synthesize(text: string, voice = DEFAULT_VOICE): Promise<string> {
  const key = requireKey()
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ model: 'gpt-4o-mini-tts', input: text, voice }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`TTS failed: ${res.status} ${body.substring(0, 200)}`)
  }
  const audioBlob = await res.blob()
  return URL.createObjectURL(audioBlob)
}

export async function runVoicePipeline(
  audio: Blob,
  opts?: { systemPrompt?: string; voice?: string }
): Promise<VoicePipelineResult> {
  const transcript = await transcribe(audio)
  const responseText = await complete(
    opts?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
    transcript
  )
  const audioUrl = await synthesize(responseText, opts?.voice ?? DEFAULT_VOICE)
  return { transcript, responseText, audioUrl }
}

export function playAudio(url: string) {
  const audio = new Audio(url)
  audio.play().catch(() => {})
  return audio
}

// Lightweight recorder using MediaRecorder
export class VoiceRecorder {
  private media: MediaRecorder | null = null
  private chunks: BlobPart[] = []
  private stream: MediaStream | null = null

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm'
    this.media = new MediaRecorder(this.stream, { mimeType: mime })
    this.chunks = []
    this.media.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data)
    }
    this.media.start()
  }

  async stop(): Promise<Blob> {
    if (!this.media) throw new Error('Recorder not started')
    await new Promise<void>((resolve) => {
      if (!this.media) return resolve()
      this.media.onstop = () => resolve()
      this.media.stop()
    })
    this.stream?.getTracks().forEach((t) => t.stop())
    const blob = new Blob(this.chunks, { type: this.media.mimeType || 'audio/webm' })
    this.media = null
    this.stream = null
    this.chunks = []
    return blob
  }
}
