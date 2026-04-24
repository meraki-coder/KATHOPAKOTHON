/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Pause, RefreshCw, Volume2, Sparkles, ChevronRight, ChevronLeft, Download, Trash2, Save, Share2, Wind, CloudRain, Bird, Waves, Bold, Italic, Underline } from 'lucide-react';
import { generateStoryAudio, VOICE_PROFILES, VoiceProfile } from './lib/gemini';
import { SavedStory, STORY_PRESETS } from './types';

// Helper: Wrap raw PCM 16-bit signed, mono, 24kHz in a WAV header
function pcmToWav(pcmData: Uint8Array, sampleRate: number = 24000) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = numChannels * bitsPerSample / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcmData.length;
  
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  
  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };
  
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);
  
  const pcmView = new Uint8Array(buffer, 44);
  pcmView.set(pcmData);
  
  return buffer;
}

// Helper: Convert ArrayBuffer to Base64
function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

export default function App() {
  const [activeView, setActiveView] = useState<'studio' | 'library' | 'presets'>('studio');
  const [library, setLibrary] = useState<SavedStory[]>([]);
  const [text, setText] = useState('একটা ছোট্ট নদীর ধারে…\nথাকত দুই বোন—সুখু আর দুখু…\nএকজনের মন ছিল সোনার মতো ভালো… আরেকজনের মনে ছিল শুধু লোভ…');
  const [isGenerating, setIsGenerating] = useState(false);
  const [audioBase64, setAudioBase64] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState<VoiceProfile>(VOICE_PROFILES[0]);
  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const [speed, setSpeed] = useState(0.9);
  const [pitch, setPitch] = useState<'low' | 'medium' | 'high'>('medium');
  const [intensity, setIntensity] = useState(82);
  const [hasBackgroundMusic, setHasBackgroundMusic] = useState(false);
  const [customInstructions, setCustomInstructions] = useState('');
  const [variation, setVariation] = useState('calm');
  const [ambiance, setAmbiance] = useState('none');
  const [sfxList, setSfxList] = useState<{id: string, name: string, url: string}[]>([]);
  const [reverb, setReverb] = useState(0);
  const [echo, setEcho] = useState(0);
  const [showModulation, setShowModulation] = useState(false);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const applyStyle = (prefix: string, suffix: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = text.substring(start, end);
    const newText = text.substring(0, start) + prefix + selectedText + suffix + text.substring(end);
    
    setText(newText);
    
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, end + prefix.length);
    }, 0);
  };

  // Load Library from LocalStorage
  useEffect(() => {
    const saved = localStorage.getItem('kathopakothon_library');
    if (saved) {
      try {
        setLibrary(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse library', e);
      }
    }
  }, []);

  const saveToLibrary = () => {
    if (!audioBase64 || !text) return;
    const newEntry: SavedStory = {
      id: Date.now().toString(),
      title: text.slice(0, 30).trim() + (text.length > 30 ? '...' : ''),
      text,
      audioBase64,
      timestamp: Date.now()
    };
    const updatedLibrary = [newEntry, ...library];
    setLibrary(updatedLibrary);
    localStorage.setItem('kathopakothon_library', JSON.stringify(updatedLibrary));
  };

  const removeFromLibrary = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updatedLibrary = library.filter(s => s.id !== id);
    setLibrary(updatedLibrary);
    localStorage.setItem('kathopakothon_library', JSON.stringify(updatedLibrary));
  };

  const handleGenerate = async () => {
    if (!text.trim()) return;
    
    setIsGenerating(true);
    setAudioBase64(null);
    setIsPlaying(false);
    
    if (sourceRef.current) {
      sourceRef.current.stop();
    }

    try {
      const audio = await generateStoryAudio(text, selectedVoice, speed, pitch, intensity, customInstructions, hasBackgroundMusic, variation, ambiance);
      if (audio) {
        // Detect if it is already a WAV
        const binary = window.atob(audio);
        if (binary.startsWith('RIFF')) {
          setAudioBase64(audio);
        } else {
          // It's likely raw PCM 16-bit signed, mono, 24kHz coming from some Gemini TTS versions
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const wavBuffer = pcmToWav(bytes, 24000);
          setAudioBase64(arrayBufferToBase64(wavBuffer));
        }
      }
    } catch (error) {
      console.error('Error generating story:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const playAudio = async () => {
    if (!audioBase64) return;

    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      const ctx = audioContextRef.current;
      
      // Ensure context is running (browser policy)
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      
      const binaryString = window.atob(audioBase64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // decodeAudioData works well for WAV containers
      const audioBuffer = await ctx.decodeAudioData(bytes.buffer.slice(0));
      
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;

      // Effects Chain
      let lastNode: AudioNode = source;

      if (echo > 0) {
        const delay = ctx.createDelay();
        delay.delayTime.value = 0.3;
        const feedback = ctx.createGain();
        feedback.gain.value = echo / 100 * 0.4;
        
        delay.connect(feedback);
        feedback.connect(delay);
        
        const echoGain = ctx.createGain();
        echoGain.gain.value = echo / 100;
        
        delay.connect(echoGain);
        echoGain.connect(ctx.destination);
        lastNode.connect(delay);
      }

      if (reverb > 0) {
        const reverbNode = ctx.createConvolver();
        const length = ctx.sampleRate * 2;
        const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
        for (let i = 0; i < 2; i++) {
          const channel = impulse.getChannelData(i);
          for (let j = 0; j < length; j++) {
            channel[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / length, 2);
          }
        }
        reverbNode.buffer = impulse;
        
        const reverbGain = ctx.createGain();
        reverbGain.gain.value = reverb / 100 * 0.5;
        
        lastNode.connect(reverbNode);
        reverbNode.connect(reverbGain);
        reverbGain.connect(ctx.destination);
      }
      
      lastNode.connect(ctx.destination);
      
      source.onended = () => {
        setIsPlaying(false);
      };

      sourceRef.current = source;
      source.start();
      setIsPlaying(true);
    } catch (error) {
      console.error('Final audio playback error:', error);
    }
  };

  const stopAudio = () => {
    if (sourceRef.current) {
      sourceRef.current.stop();
      setIsPlaying(false);
    }
  };

  const handleDownload = () => {
    if (!audioBase64) return;
    
    const link = document.createElement('a');
    link.href = `data:audio/wav;base64,${audioBase64}`;
    link.download = `story_${Date.now()}.wav`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: 'Bengali Story Narration',
        text: text,
        url: window.location.href
      }).catch(console.error);
    } else {
      navigator.clipboard.writeText(window.location.href);
      alert('Link copied to clipboard!');
    }
  };

  const playSfx = (url: string) => {
    const audio = new Audio(url);
    audio.play().catch(console.error);
  };

  const handleSfxUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setSfxList([...sfxList, { id: Date.now().toString(), name: file.name, url }]);
  };

  return (
    <div className="min-h-screen bg-[#0A0502] text-[#E0D8D0] font-sans flex flex-col overflow-hidden relative">
      {/* Background Atmosphere */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-[#3A1510] rounded-full blur-[120px] opacity-40 animate-pulse"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-[#FF4E00] rounded-full blur-[150px] opacity-10"></div>
      </div>

      {/* Top Navigation */}
      <header className="relative z-10 h-20 px-10 flex items-center justify-between border-b border-white/10 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 bg-gradient-to-br from-[#FF4E00] to-[#3A1510] rounded-full shadow-[0_0_20px_rgba(255,78,0,0.3)]"></div>
          <h1 className="text-xl font-light tracking-[0.2em] uppercase">
            Kathopakothon <span className="text-[10px] opacity-30 ml-2 uppercase tracking-widest hidden sm:inline">AI Narrative Studio</span>
          </h1>
        </div>
        <nav className="flex items-center gap-8 text-[11px] font-medium tracking-widest uppercase opacity-70">
          <span 
            onClick={() => setActiveView('library')}
            className={`hover:opacity-100 transition-opacity cursor-pointer ${activeView === 'library' ? 'text-[#FF4E00]' : ''}`}
          >
            Library
          </span>
          <span 
            onClick={() => setActiveView('studio')}
            className={`hover:opacity-100 transition-opacity cursor-pointer ${activeView === 'studio' ? 'text-[#FF4E00]' : ''}`}
          >
            Studio
          </span>
          <span 
            onClick={() => setActiveView('presets')}
            className={`hover:opacity-100 transition-opacity cursor-pointer ${activeView === 'presets' ? 'text-[#FF4E00]' : ''}`}
          >
            Presets
          </span>
          <div className="w-10 h-10 rounded-full border border-white/20 flex items-center justify-center ml-4 cursor-pointer hover:bg-white/5 transition-colors">
            <Sparkles className="w-4 h-4 opacity-50" />
          </div>
        </nav>
      </header>

      <main className="relative z-10 flex-1 flex flex-col md:flex-row p-8 gap-8 overflow-hidden">
        <AnimatePresence mode="wait">
          {activeView === 'studio' && (
            <motion.div 
              key="studio" 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex-1 flex flex-col md:flex-row gap-8 overflow-hidden"
            >
              {/* Sidebar Controls */}
              <aside className="w-full md:w-80 flex flex-col gap-6 overflow-y-auto pr-2">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="p-6 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-xl relative overflow-hidden"
          >
            <div className="flex justify-between items-center mb-4">
              <label className="text-[10px] uppercase tracking-widest opacity-50 block">Voice Profile</label>
              <button 
                onClick={() => setShowVoicePicker(!showVoicePicker)}
                className="text-[10px] uppercase tracking-widest text-[#FF4E00] hover:opacity-80 transition-opacity"
              >
                {showVoicePicker ? 'Close' : 'Change'}
              </button>
            </div>

            <AnimatePresence mode="wait">
              {showVoicePicker ? (
                <motion.div 
                  key="picker"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-3"
                >
                  {VOICE_PROFILES.map((profile) => (
                    <button
                      key={profile.id}
                      onClick={() => {
                        setSelectedVoice(profile);
                        setShowVoicePicker(false);
                      }}
                      className={`w-full flex items-center gap-4 p-3 rounded-2xl transition-all border ${
                        selectedVoice.id === profile.id 
                          ? 'bg-[#FF4E00]/10 border-[#FF4E00]/40' 
                          : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05]'
                      }`}
                    >
                      <div className="w-10 h-10 rounded-full bg-[#1A1A1A] border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                        <span className="text-base">{profile.emoji}</span>
                      </div>
                      <div className="text-left">
                        <div className="text-xs font-medium">{profile.name}</div>
                        <div className="text-[9px] opacity-40 uppercase tracking-tight">{profile.description}</div>
                      </div>
                    </button>
                  ))}
                </motion.div>
              ) : (
                <motion.div 
                  key="current"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.05 }}
                >
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-12 h-12 rounded-full bg-[#1A1A1A] border border-[#FF4E00]/30 flex items-center justify-center overflow-hidden shadow-[0_0_15px_rgba(255,78,0,0.1)]">
                      <span className="text-2xl">{selectedVoice.emoji}</span>
                    </div>
                    <div>
                      <div className="text-sm font-medium">{selectedVoice.name}</div>
                      <div className="text-[10px] opacity-50">{selectedVoice.description}</div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <div className="flex justify-between text-[11px] mb-2">
                        <span className="opacity-70 uppercase tracking-widest">Speed</span>
                        <span className="text-[#FF4E00]">{speed}x</span>
                      </div>
                      <input 
                        type="range"
                        min="0.5"
                        max="1.5"
                        step="0.1"
                        value={speed}
                        onChange={(e) => setSpeed(parseFloat(e.target.value))}
                        className="w-full h-1 bg-white/10 appearance-none cursor-pointer accent-[#FF4E00] rounded-full"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] mb-2">
                        <span className="opacity-70 uppercase tracking-widest">Variation</span>
                        <span className="text-[#FF4E00] capitalize">{variation}</span>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        {['calm', 'excited', 'sad', 'neutral'].map((v) => (
                          <button
                            key={v}
                            onClick={() => setVariation(v)}
                            className={`px-3 py-1 rounded-full text-[9px] uppercase tracking-wider border transition-all ${
                              variation === v 
                                ? 'bg-[#FF4E00] border-[#FF4E00] text-white' 
                                : 'bg-white/5 border-white/10 hover:border-white/30 opacity-60'
                            }`}
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] mb-2">
                        <span className="opacity-70 uppercase tracking-widest">Pitch</span>
                        <span className="text-[#FF4E00] capitalize">{pitch}</span>
                      </div>
                      <div className="flex gap-1 mb-6">
                        {(['low', 'medium', 'high'] as const).map((p) => (
                          <button
                            key={p}
                            onClick={() => setPitch(p)}
                            className={`flex-1 h-1 transition-all rounded-full ${
                              p === pitch ? 'bg-[#FF4E00]' : 'bg-white/10 hover:bg-white/20'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-[11px] mb-2">
                        <span className="opacity-70 uppercase tracking-widest">Emotional Weight</span>
                        <span className="text-[#FF4E00]">{intensity}%</span>
                      </div>
                      <input 
                        type="range"
                        min="0"
                        max="100"
                        value={intensity}
                        onChange={(e) => setIntensity(parseInt(e.target.value))}
                        className="w-full h-1 bg-white/10 appearance-none cursor-pointer accent-[#FF4E00] rounded-full"
                      />
                    </div>
                    
                    <div className="pt-4 border-t border-white/5 space-y-6">
                      <div>
                        <div className="flex justify-between text-[11px] mb-3">
                          <span className="opacity-70 uppercase tracking-widest">Ambiance</span>
                          <span className="text-[#FF4E00] capitalize">{ambiance}</span>
                        </div>
                        <div className="grid grid-cols-5 gap-2">
                          {[
                            { id: 'none', icon: Volume2 },
                            { id: 'rain', icon: CloudRain },
                            { id: 'wind', icon: Wind },
                            { id: 'forest', icon: Bird },
                            { id: 'village', icon: Waves }
                          ].map((a) => (
                            <button
                              key={a.id}
                              onClick={() => setAmbiance(a.id)}
                              className={`aspect-square rounded-2xl flex items-center justify-center transition-all border ${
                                ambiance === a.id 
                                  ? 'bg-[#FF4E00] border-[#FF4E00] text-white shadow-lg shadow-[#FF4E00]/20' 
                                  : 'bg-white/5 border-white/10 hover:border-white/20 opacity-50'
                              }`}
                            >
                              <a.icon className="w-4 h-4" />
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="flex justify-between items-center text-[11px] opacity-70 uppercase tracking-widest">
                          <span>Sound Pad</span>
                          <label className="cursor-pointer text-[#FF4E00] hover:opacity-80 transition-opacity">
                            + Add Custom
                            <input type="file" accept="audio/*" className="hidden" onChange={handleSfxUpload} />
                          </label>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          {[
                            { id: 'birds', name: 'Birdsong', emoji: '🐦' },
                            { id: 'crickets', name: 'Crickets', emoji: '🦗' },
                            { id: 'bells', name: 'Temple Bells', emoji: '🔔' }
                          ].map(s => (
                            <button 
                              key={s.id}
                              onClick={() => {
                                // These are representative. In a real app we'd have actual URLs.
                                // For now we trigger them via Gemini if they are in instructions, 
                                // but as a "Pad" it should play locally.
                                console.log(`Triggering ${s.name}`);
                              }}
                              className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] flex items-center gap-2 hover:bg-white/10 transition-colors"
                            >
                              <span>{s.emoji}</span>
                              <span className="opacity-60">{s.name}</span>
                            </button>
                          ))}
                          {sfxList.map(s => (
                            <button 
                              key={s.id}
                              onClick={() => playSfx(s.url)}
                              className="px-3 py-2 rounded-xl bg-[#FF4E00]/10 border border-[#FF4E00]/20 text-[10px] flex items-center gap-2 hover:bg-[#FF4E00]/20 transition-colors"
                            >
                              <Volume2 className="w-3 h-3 text-[#FF4E00]" />
                              <span className="text-[#FF4E00] line-clamp-1 max-w-[80px]">{s.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-4">
                        <button 
                          onClick={() => setShowModulation(!showModulation)}
                          className="flex items-center justify-between w-full text-[11px] uppercase tracking-widest opacity-70 hover:opacity-100"
                        >
                          Voice Modulation
                          <ChevronRight className={`w-4 h-4 transition-transform ${showModulation ? 'rotate-90' : ''}`} />
                        </button>
                        
                        {showModulation && (
                          <motion.div 
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            className="space-y-4 pt-2"
                          >
                            <div>
                              <div className="flex justify-between text-[10px] mb-2 opacity-50">
                                <span>REVERB</span>
                                <span>{reverb}%</span>
                              </div>
                              <input 
                                type="range" 
                                min="0" max="100" 
                                value={reverb}
                                onChange={(e) => setReverb(parseInt(e.target.value))}
                                className="w-full h-1 bg-white/10 appearance-none cursor-pointer accent-[#FF4E00] rounded-full"
                              />
                            </div>
                            <div>
                              <div className="flex justify-between text-[10px] mb-2 opacity-50">
                                <span>ECHO</span>
                                <span>{echo}%</span>
                              </div>
                              <input 
                                type="range" 
                                min="0" max="100" 
                                value={echo}
                                onChange={(e) => setEcho(parseInt(e.target.value))}
                                className="w-full h-1 bg-white/10 appearance-none cursor-pointer accent-[#FF4E00] rounded-full"
                              />
                            </div>
                          </motion.div>
                        )}
                      </div>

                      <label className="flex items-center gap-3 cursor-pointer group">
                        <div 
                          onClick={() => setHasBackgroundMusic(!hasBackgroundMusic)}
                          className={`w-10 h-5 rounded-full relative transition-all ${hasBackgroundMusic ? 'bg-[#FF4E00]' : 'bg-white/10'}`}
                        >
                          <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${hasBackgroundMusic ? 'left-6' : 'left-1'}`} />
                        </div>
                        <span className="text-[11px] uppercase tracking-widest opacity-70 group-hover:opacity-100 transition-opacity">Background Music</span>
                      </label>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="p-6 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-xl flex-1 flex flex-col"
          >
            <div className="flex justify-between items-center mb-4">
              <label className="text-[10px] uppercase tracking-widest opacity-50 block">Styling Tips & Notes</label>
            </div>
            
            <textarea
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              placeholder="Add narrative notes... (e.g. 'Whisper the end')"
              className="w-full bg-[#1A1A1A]/50 border border-white/5 rounded-xl p-3 text-[11px] font-sans h-20 mb-4 focus:ring-1 focus:ring-[#FF4E00]/50 placeholder:opacity-20 resize-none"
            />

            <ul className="text-xs space-y-3 opacity-40 font-light leading-relaxed mb-auto">
              <li className="flex gap-2"><span>•</span> {intensity > 70 ? 'High dramatic energy active' : 'Subtle narrative mode active'}</li>
              <li className="flex gap-2"><span>•</span> Variation set to <b>{variation}</b></li>
              <li className="flex gap-2"><span>•</span> Use "..." for longer dramatic pauses</li>
              <li className="flex gap-2"><span>•</span> {selectedVoice.name === 'Pori' ? 'Whimsical Bengali tone' : 'Classical storytelling style'}</li>
              <li className="flex gap-2"><span>•</span> Pitch set to {pitch} for {pitch === 'low' ? 'authoritative' : pitch === 'high' ? 'lighter' : 'balanced'} tone</li>
            </ul>
          </motion.div>
        </aside>

        {/* Narrative Editor Area */}
        <section className="flex-1 flex flex-col gap-6 overflow-hidden">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex-1 p-8 sm:p-12 rounded-[40px] bg-white/[0.02] border border-white/5 backdrop-blur-sm relative overflow-hidden flex flex-col"
          >
            <div className="absolute top-8 left-12 flex items-center gap-8">
              <span className="text-[10px] uppercase tracking-[0.3em] opacity-30">Script Editor</span>
              <div className="flex gap-2 p-1 bg-white/5 rounded-lg border border-white/5">
                <button 
                  onClick={() => applyStyle('**', '**')}
                  className="p-1 px-2 hover:bg-white/10 rounded transition-colors"
                  title="Bold (Emphasis)"
                >
                  <Bold className="w-3 h-3 opacity-40 hover:opacity-100" />
                </button>
                <button 
                  onClick={() => applyStyle('*', '*')}
                  className="p-1 px-2 hover:bg-white/10 rounded transition-colors"
                  title="Italic (Soft/Emotional)"
                >
                  <Italic className="w-3 h-3 opacity-40 hover:opacity-100" />
                </button>
                <button 
                  onClick={() => applyStyle('_', '_')}
                  className="p-1 px-2 hover:bg-white/10 rounded transition-colors"
                  title="Underline (Slower/Important)"
                >
                  <Underline className="w-3 h-3 opacity-40 hover:opacity-100" />
                </button>
              </div>
            </div>
            
            <div className="mt-12 flex-1 flex flex-col relative group">
              {/* Character Progress Header */}
              <div className="flex justify-between items-center mb-4 px-2">
                <div className="flex gap-4">
                  <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${isGenerating ? 'bg-amber-500' : 'bg-[#FF4E00]'}`} />
                    <span className="text-[9px] uppercase tracking-[0.2em] opacity-40">
                      {isGenerating ? 'Processing AI...' : 'Ready to record'}
                    </span>
                  </div>
                  <div className="h-4 w-[1px] bg-white/5" />
                  <span className="text-[9px] opacity-20 uppercase tracking-widest">{text.split('\n').length} lines detected</span>
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="w-40 h-[2px] bg-white/5 rounded-full overflow-hidden relative">
                    <motion.div 
                      className="absolute left-0 top-0 h-full bg-[#FF4E00]/60"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min((text.length / 1000) * 100, 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-mono opacity-30 tracking-tight">{text.length}<span className="opacity-40">/1000</span></span>
                </div>
              </div>

              <div className="flex-1 flex gap-6 relative border-t border-white/5 pt-6">
                {/* Line numbering gutter */}
                <div className="w-8 flex flex-col font-mono text-[11px] opacity-10 text-right select-none pt-1">
                  {text.split('\n').map((_, i) => (
                    <div key={i} className="h-[1.75em]">{i + 1}</div>
                  ))}
                </div>

                <div className="relative flex-1">
                  {/* Syntax highlighting background layer */}
                  <div 
                    className="absolute inset-0 text-3xl md:text-5xl font-serif leading-snug break-words whitespace-pre-wrap pointer-events-none opacity-0 group-focus-within:opacity-100 transition-opacity"
                    style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: '1.4' }}
                    aria-hidden="true"
                  >
                    {text.split(/(\*\*.*?\*\*|\*.*?\*|_.*?_)/g).map((part, i) => {
                      if (part.startsWith('**')) return <span key={i} className="text-[#FF4E00]/20 font-bold">{part}</span>;
                      if (part.startsWith('*')) return <span key={i} className="text-amber-500/20 italic">{part}</span>;
                      if (part.startsWith('_')) return <span key={i} className="text-sky-500/20 underline underline-offset-8">{part}</span>;
                      return <span key={i} className="opacity-0">{part}</span>;
                    })}
                  </div>

                  <textarea
                    id="story-input"
                    ref={textareaRef}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="গল্পটি এখানে লিখুন..."
                    maxLength={1000}
                    className="w-full bg-transparent border-none focus:ring-0 text-3xl md:text-5xl font-serif italic leading-snug h-full resize-none placeholder:opacity-10 text-white/90 selection:bg-[#FF4E00]/40 custom-scrollbar scroll-smooth relative z-10"
                    style={{ lineHeight: '1.4' }}
                  />
                </div>
              </div>
              
              {/* Decorative side markers for script lines */}
              <div className="absolute -left-6 top-0 flex flex-col gap-10 opacity-20 pointer-events-none">
                <span className="text-[#FF4E00] text-xl">•</span>
                <span className="text-[#FF4E00] text-xl">•</span>
                <span className="text-[#FF4E00] text-xl">•</span>
              </div>
            </div>

            <div className="absolute bottom-8 right-12 flex gap-4 items-center">
              <span className="text-[10px] tracking-widest opacity-20 uppercase">
                {text.length} Characters | Emotional Pacing Enabled
              </span>
            </div>
          </motion.div>

          {/* Playback Console */}
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="h-24 rounded-full bg-white/5 border border-white/10 backdrop-blur-3xl flex items-center px-6 sm:px-10 gap-6 sm:gap-8"
          >
            <button
              onClick={isPlaying ? stopAudio : (audioBase64 ? playAudio : undefined)}
              disabled={!audioBase64 && !isPlaying}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all border border-white/10 ${
                audioBase64 ? 'bg-white/10 hover:bg-white/20 active:scale-95' : 'opacity-20 cursor-not-allowed'
              }`}
            >
              <AnimatePresence mode="wait">
                {isPlaying ? (
                  <motion.div key="pause" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                    <Pause className="w-5 h-5 fill-white text-white" />
                  </motion.div>
                ) : (
                  <motion.div key="play" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                    <Play className="w-5 h-5 fill-white text-white ml-1" />
                  </motion.div>
                )}
              </AnimatePresence>
            </button>

            {audioBase64 && (
              <button
                onClick={saveToLibrary}
                className="w-12 h-12 rounded-full flex items-center justify-center bg-[#FF4E00]/10 border border-[#FF4E00]/20 hover:bg-[#FF4E00]/20 transition-all hover:scale-105 active:scale-95"
                title="Save to Library"
              >
                <Save className="w-5 h-5 text-[#FF4E00]" />
              </button>
            )}

            {audioBase64 && (
              <button
                onClick={handleShare}
                className="w-12 h-12 rounded-full flex items-center justify-center bg-white/5 border border-white/10 hover:bg-white/10 transition-all hover:scale-105 active:scale-95"
                title="Share Link"
              >
                <Share2 className="w-5 h-5 opacity-60" />
              </button>
            )}

            {audioBase64 && (
              <button
                onClick={handleDownload}
                className="w-12 h-12 rounded-full flex items-center justify-center bg-white/5 border border-white/10 hover:bg-white/10 transition-all hover:scale-105 active:scale-95"
                title="Download Audio"
              >
                <Download className="w-5 h-5 opacity-60" />
              </button>
            )}
            
            <div className="flex-1 flex flex-col justify-center">
              <div className="flex justify-between text-[10px] uppercase tracking-widest mb-3 opacity-40 px-1">
                <span>0:00</span>
                <span>{isGenerating ? 'Generation in Progress...' : (isPlaying ? 'Now Narrating' : 'Studio Ready')}</span>
                <span>N/A</span>
              </div>
              <div className="h-1 bg-white/5 w-full rounded-full overflow-hidden">
                {isGenerating || isPlaying ? (
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: isPlaying ? '100%' : '35%' }}
                    transition={{ duration: isPlaying ? 20 : 1, ease: "linear" }}
                    className="h-full bg-gradient-to-r from-[#FF4E00] to-[#3A1510] relative"
                  >
                    <div className="absolute right-0 top-0 h-full w-20 bg-white/10 blur-md"></div>
                  </motion.div>
                ) : null}
              </div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="px-6 sm:px-10 h-12 rounded-full bg-white text-black font-semibold text-[10px] tracking-widest uppercase hover:bg-[#E0D8D0] transition-all disabled:opacity-30 disabled:scale-95 flex items-center gap-3"
            >
              {isGenerating ? (
                <RefreshCw className="w-3 h-3 animate-spin" />
              ) : (
                <Volume2 className="w-3 h-3" />
              )}
              <span>{isGenerating ? 'Rendering' : 'Render Audio'}</span>
            </button>
          </motion.div>
        </section>
            </motion.div>
          )}

          {activeView === 'library' && (
            <motion.div 
              key="library"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex-1 overflow-y-auto px-4"
            >
              <div className="max-w-4xl mx-auto py-10">
                <h2 className="text-3xl font-serif italic mb-8">Generated Library</h2>
                {library.length === 0 ? (
                  <div className="p-20 text-center bg-white/[0.02] rounded-[40px] border border-dashed border-white/10">
                    <p className="opacity-30 uppercase tracking-[0.2em] text-sm">No narrations saved yet</p>
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {library.map((item) => (
                      <div 
                        key={item.id}
                        onClick={() => {
                          setAudioBase64(item.audioBase64);
                          setText(item.text);
                          setActiveView('studio');
                        }}
                        className="p-6 rounded-[32px] bg-white/[0.03] border border-white/5 hover:border-[#FF4E00]/30 transition-all cursor-pointer flex items-center justify-between group"
                      >
                        <div>
                          <p className="font-serif italic text-xl mb-1">{item.title}</p>
                          <p className="text-[10px] opacity-30 uppercase tracking-widest">
                            {new Date(item.timestamp).toLocaleDateString()} • {item.text.length} Characters
                          </p>
                        </div>
                        <div className="flex gap-4 items-center">
                          <button 
                            onClick={(e) => removeFromLibrary(item.id, e)}
                            className="p-2 opacity-0 group-hover:opacity-40 hover:text-red-500 hover:opacity-100 transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <div className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center">
                            <Play className="w-4 h-4 fill-white opacity-40 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeView === 'presets' && (
            <motion.div 
              key="presets"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex-1 overflow-y-auto px-4"
            >
              <div className="max-w-4xl mx-auto py-10">
                <h2 className="text-3xl font-serif italic mb-2">Classic Presets</h2>
                <p className="text-xs opacity-40 uppercase tracking-widest mb-10">Hand-picked story blocks</p>
                <div className="grid sm:grid-cols-2 gap-6">
                  {STORY_PRESETS.map((preset) => (
                    <div 
                      key={preset.id}
                      onClick={() => {
                        setText(preset.snippet);
                        setAudioBase64(null);
                        setActiveView('studio');
                      }}
                      className="p-8 rounded-[40px] bg-white/[0.03] border border-white/5 hover:bg-[#FF4E00]/5 hover:border-[#FF4E00]/20 transition-all cursor-pointer flex flex-col items-start gap-4"
                    >
                      <span className="text-[9px] uppercase tracking-widest px-2 py-1 bg-white/5 rounded-full opacity-50">{preset.category}</span>
                      <h3 className="text-2xl font-serif italic">{preset.title}</h3>
                      <p className="text-xs opacity-40 line-clamp-2 leading-relaxed">{preset.snippet}</p>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Branding Detail */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 opacity-10 text-[9px] tracking-[0.5em] uppercase pointer-events-none">
        Atmospheric Audio Engine v2.4.0
      </div>
    </div>
  );
}

