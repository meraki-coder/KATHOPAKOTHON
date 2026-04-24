export interface SavedStory {
  id: string;
  title: string;
  text: string;
  audioBase64: string;
  timestamp: number;
}

export interface StoryPreset {
  id: string;
  title: string;
  snippet: string;
  category: string;
}

export const STORY_PRESETS: StoryPreset[] = [
  {
    id: 'folk-1',
    title: 'সুখু আর দুখু',
    snippet: 'একটা ছোট্ট নদীর ধারে…\nথাকত দুই বোন—সুখু আর দুখু…\nএকজনের মন ছিল সোনার মতো ভালো… আরেকজনের মনে ছিল শুধু লোভ…',
    category: 'Folk Tale'
  },
  {
    id: 'fantasy-1',
    title: 'চাঁদের বুড়ি',
    snippet: 'অনেক অনেক বছর আগের কথা… চাঁদের বুড়ি যখন সুতো কাটত তার চরকায়…\nতখন পৃথিবীটা ছিল অনেক বেশি মায়াবী…',
    category: 'Fantasy'
  },
  {
    id: 'nature-1',
    title: 'বর্ষার দুপুর',
    snippet: 'ঝিরিঝিরি বৃষ্টি পড়ছে জানালার বাইরে… দূরে কোথাও একটা ময়ূর ডাকছে…\nমনটা আজ কেমন উদাস হয়ে আছে…',
    category: 'Atmospheric'
  }
];
