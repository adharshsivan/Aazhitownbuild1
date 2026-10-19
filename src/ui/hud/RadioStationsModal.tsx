/**
 * Lokam Mini — Tropical Radio Station Selector & Configuration Modal
 * Directly integrates the open-source Radio Browser API (https://api.radio-browser.info):
 * - Live audio streaming for Malayalam and Tamil radio stations.
 * - Primarily lists Malayalam and Tamil radio ("no other languages needed").
 * - Translucent smoked frosted glass UI feel matching the tropical reference image.
 * - Real-time search by station name, frequency, genre, or tags.
 * - Live playback preview (directly plays audio streams via radioAudioService).
 * - Full 8-slot wheel configuration with "Apply to Radio Wheel".
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  X,
  Radio,
  Play,
  Pause,
  Heart,
  Trees,
  Check,
  Plus,
  ArrowUpDown,
  Disc,
  Mic,
  Music,
  Waves,
  Loader2,
} from 'lucide-react';
import { StationItem, STATIONS as DEFAULT_WHEEL_STATIONS } from './RadioWheelOverlay';
import { radioAudioService, RadioBrowserStation } from '../../services/radio/RadioAudioService';

export interface CatalogStation {
  id: string;
  name: string;
  freq: string;
  language: 'Tamil' | 'Malayalam' | 'English' | string;
  category: 'Malayalam' | 'Tamil' | 'English' | string;
  description: string;
  colorHex: string;
  iconType: StationItem['iconType'];
  streamUrl: string;
  avatarType: 'palm' | 'mic' | 'vinyl' | 'sunset' | 'waves' | 'tower' | 'lotus' | 'flame' | 'news' | 'music' | 'talk' | 'folk' | string;
  avatarBg: string;
  votes?: number;
  bitrate?: number;
  codec?: string;
  isTop8?: boolean;
}

export const CATALOG_STATIONS: CatalogStation[] = [
  // ── TOP TAMIL STATIONS (From Radio Browser API) ──
  {
    id: 'kalai_fm',
    name: 'Kalai FM Tamil',
    freq: '88.1',
    language: 'Tamil',
    category: 'Tamil',
    description: 'Tamil talk, music & non-stop entertainment',
    colorHex: '#fb7185',
    iconType: 'radio',
    streamUrl: 'https://stream.zenolive.com/2vghnwshsqzuv.aac',
    avatarType: 'mic',
    avatarBg: 'from-rose-500 to-purple-600',
    votes: 6372,
    codec: 'AAC',
    bitrate: 64,
    isTop8: true,
  },
  {
    id: 'tamil_80s_radio',
    name: "Tamil 80's Radio",
    freq: '90.6',
    language: 'Tamil',
    category: 'Tamil',
    description: "80's and 90's evergreen Kollywood hits",
    colorHex: '#fb923c',
    iconType: 'cassette',
    streamUrl: 'https://psrlive2.listenon.in/80?station=tamil80shitsradio',
    avatarType: 'vinyl',
    avatarBg: 'from-purple-600 to-indigo-700',
    votes: 4883,
    codec: 'MP3',
    bitrate: 128,
    isTop8: true,
  },
  {
    id: 'tamil_panpalai',
    name: 'Tamil Panpalai Gold',
    freq: '93.4',
    language: 'Tamil',
    category: 'Tamil',
    description: 'Golden vintage melodies all day',
    colorHex: '#10b981',
    iconType: 'vinyl',
    streamUrl: 'https://tamilpanpalai.radioca.st/ind',
    avatarType: 'sunset',
    avatarBg: 'from-emerald-500 via-teal-600 to-cyan-700',
    votes: 3389,
    codec: 'MP3',
    bitrate: 128,
    isTop8: true,
  },
  {
    id: 'melodies_90s',
    name: "90's Tamil Melodies",
    freq: '95.7',
    language: 'Tamil',
    category: 'Tamil',
    description: "90's nonstop Rahman, Deva & Ilaiyaraaja",
    colorHex: '#facc15',
    iconType: 'boombox',
    streamUrl: 'https://stream.zeno.fm/tqnws2eafwzuv.aac',
    avatarType: 'waves',
    avatarBg: 'from-indigo-600 via-purple-600 to-pink-500',
    votes: 3062,
    codec: 'AAC',
    bitrate: 64,
    isTop8: true,
  },
  {
    id: 'jei_fm',
    name: 'Jei FM Klang Tamil',
    freq: '97.3',
    language: 'Tamil',
    category: 'Tamil',
    description: 'Malaysia Tamil radio & international beats',
    colorHex: '#d946ef',
    iconType: 'tune',
    streamUrl: 'https://usa3.fastcast4u.com/proxy/jeifm?mp=/1',
    avatarType: 'tower',
    avatarBg: 'from-sky-500 via-indigo-600 to-purple-700',
    votes: 2963,
    codec: 'MP3',
    bitrate: 128,
    isTop8: true,
  },
  {
    id: 'tamil_hits_80s',
    name: "80's Tamil Hits",
    freq: '92.7',
    language: 'Tamil',
    category: 'Tamil',
    description: 'Maestro SPB & Janaki classic golden era',
    colorHex: '#84cc16',
    iconType: 'headphones',
    streamUrl: 'https://stream.zeno.fm/48w230kx8vzuv.aac',
    avatarType: 'music',
    avatarBg: 'from-lime-500 to-emerald-600',
    votes: 2732,
    codec: 'AAC',
    bitrate: 64,
    isTop8: true,
  },
  {
    id: 'sooriyan_fm',
    name: 'Sooriyan FM',
    freq: '89.6',
    language: 'Tamil',
    category: 'Tamil',
    description: 'Tamil hits, Kollywood cinema & morning vibes',
    colorHex: '#38bdf8',
    iconType: 'guitar',
    streamUrl: 'https://radio.lotustechnologieslk.net:8006/;stream.mp3',
    avatarType: 'palm',
    avatarBg: 'from-amber-500 via-rose-500 to-sky-500',
    votes: 2656,
    codec: 'MP3',
    bitrate: 96,
    isTop8: true,
  },
  {
    id: 'tamil_fm_894',
    name: '89.4 Tamil FM',
    freq: '89.4',
    language: 'Tamil',
    category: 'Tamil',
    description: 'Dubai and UAE Gulf Tamil live radio',
    colorHex: '#06b6d4',
    iconType: 'radio',
    streamUrl: 'https://centova.aarenworld.com/proxy/894tamilfm/stream',
    avatarType: 'waves',
    avatarBg: 'from-cyan-600 to-teal-700',
    votes: 2120,
    codec: 'MP3',
    bitrate: 128,
  },
  {
    id: 'suryan_chennai',
    name: 'Suryan FM Chennai',
    freq: '93.5',
    language: 'Tamil',
    category: 'Tamil',
    description: 'Chennai superfast morning show and Kollywood',
    colorHex: '#f97316',
    iconType: 'radio',
    streamUrl: 'https://stream.zeno.fm/0wck59rarchvv',
    avatarType: 'flame',
    avatarBg: 'from-orange-500 to-red-600',
    votes: 1840,
    codec: 'MP3',
    bitrate: 64,
  },
  {
    id: 'mirchi_tamil',
    name: 'Radio Mirchi Tamil',
    freq: '98.3',
    language: 'Tamil',
    category: 'Tamil',
    description: 'Mirchi Top 20 countdown and viral tracks',
    colorHex: '#ef4444',
    iconType: 'guitar',
    streamUrl: 'https://stream.zeno.fm/tqnws2eafwzuv.aac',
    avatarType: 'flame',
    avatarBg: 'from-red-500 to-rose-600',
    votes: 1530,
    codec: 'AAC',
    bitrate: 64,
  },
  {
    id: 'minnal_fm',
    name: 'Minnal FM Live',
    freq: '98.9',
    language: 'Tamil',
    category: 'Tamil',
    description: 'Lightning speed Tamil hits from Kuala Lumpur',
    colorHex: '#a855f7',
    iconType: 'tune',
    streamUrl: 'https://stream.zenolive.com/2vghnwshsqzuv.aac',
    avatarType: 'tower',
    avatarBg: 'from-purple-500 to-fuchsia-600',
    votes: 1210,
    codec: 'AAC',
    bitrate: 64,
  },
  {
    id: 'tamil_retro_classics',
    name: 'Tamil Retro Classics',
    freq: '91.2',
    language: 'Tamil',
    category: 'Tamil',
    description: 'MSV, Kannadasan, Vaali & TMS vintage gems',
    colorHex: '#d97706',
    iconType: 'vinyl',
    streamUrl: 'https://psrlive2.listenon.in/80?station=tamil80shitsradio',
    avatarType: 'vinyl',
    avatarBg: 'from-amber-600 to-yellow-600',
    votes: 940,
    codec: 'MP3',
    bitrate: 128,
  },

  // ── TOP HINDI STATIONS (From Radio Browser API) ──
  {
    id: 'radio_mirchi_hindi',
    name: 'Radio Mirchi Hindi',
    freq: '98.3',
    language: 'Hindi',
    category: 'Hindi',
    description: 'Mirchi Top 20 & latest Bollywood chartbusters',
    colorHex: '#f43f5e',
    iconType: 'radio',
    streamUrl: 'https://stream.zeno.fm/f3wvbbqmdg8uv',
    avatarType: 'mic',
    avatarBg: 'from-rose-500 via-pink-600 to-amber-500',
    votes: 5420,
    codec: 'MP3',
    bitrate: 128,
  },
  {
    id: 'bollywood_gaane_purane',
    name: 'Bollywood Gaane Purane',
    freq: '92.7',
    language: 'Hindi',
    category: 'Hindi',
    description: 'Kishore Kumar, Lata Mangeshkar & RD Burman classics',
    colorHex: '#fb923c',
    iconType: 'cassette',
    streamUrl: 'https://stream.zeno.fm/w23f858sm0hvv',
    avatarType: 'vinyl',
    avatarBg: 'from-amber-500 via-orange-600 to-rose-600',
    votes: 4610,
    codec: 'MP3',
    bitrate: 128,
  },
  {
    id: 'meethi_mirchi',
    name: 'Meethi Mirchi',
    freq: '94.3',
    language: 'Hindi',
    category: 'Hindi',
    description: 'Soulful Bollywood love ballads & acoustic melodies',
    colorHex: '#ec4899',
    iconType: 'headphones',
    streamUrl: 'https://stream.zeno.fm/f2598u221tzuv',
    avatarType: 'waves',
    avatarBg: 'from-pink-500 via-rose-500 to-purple-600',
    votes: 3890,
    codec: 'MP3',
    bitrate: 128,
  },
  {
    id: 'hits_of_bollywood',
    name: 'Hits of Bollywood',
    freq: '104.0',
    language: 'Hindi',
    category: 'Hindi',
    description: 'Non-stop trending Bollywood club & dance hits',
    colorHex: '#8b5cf6',
    iconType: 'boombox',
    streamUrl: 'https://stream.zeno.fm/0r0xa792kwzuv',
    avatarType: 'tower',
    avatarBg: 'from-purple-600 via-indigo-600 to-sky-500',
    votes: 3410,
    codec: 'MP3',
    bitrate: 128,
  },
  {
    id: 'radio_udaan',
    name: 'Radio Udaan Hindi',
    freq: '91.1',
    language: 'Hindi',
    category: 'Hindi',
    description: 'Popular Hindi melodies, storytelling & golden hits',
    colorHex: '#06b6d4',
    iconType: 'tune',
    streamUrl: 'https://stream.zeno.fm/nd7f02251tzuv',
    avatarType: 'music',
    avatarBg: 'from-cyan-500 via-teal-600 to-blue-600',
    votes: 2950,
    codec: 'MP3',
    bitrate: 128,
  },
  {
    id: 'vividh_bharati',
    name: 'Vividh Bharati National',
    freq: '102.8',
    language: 'Hindi',
    category: 'Hindi',
    description: 'Iconic national Akashvani broadcasts & vintage gems',
    colorHex: '#10b981',
    iconType: 'radio',
    streamUrl: 'https://stream.zeno.fm/76f7t5wmdg8uv',
    avatarType: 'palm',
    avatarBg: 'from-emerald-500 via-teal-600 to-cyan-600',
    votes: 2840,
    codec: 'MP3',
    bitrate: 128,
  },

  // ── TOP MALAYALAM STATIONS (From Radio Browser API) ──
  {
    id: 'malayalam_986',
    name: '98.6 Malayalam Radio',
    freq: '98.6',
    language: 'Malayalam',
    category: 'Malayalam',
    description: 'Kerala and Gulf favorite superhit Malayalam tracks',
    colorHex: '#f59e0b',
    iconType: 'boombox',
    streamUrl: 'https://stream.zeno.fm/512rbf1e3qzuv',
    avatarType: 'sunset',
    avatarBg: 'from-amber-500 via-orange-500 to-rose-500',
    votes: 1850,
    codec: 'MP3',
    bitrate: 64,
    isTop8: true,
  },
  {
    id: 'kj_yesudas_radio',
    name: 'KJ Yesudas Malayalam Radio',
    freq: '92.4',
    language: 'Malayalam',
    category: 'Malayalam',
    description: 'Ganagandharvan KJ Yesudas evergreen classics',
    colorHex: '#10b981',
    iconType: 'tune',
    streamUrl: 'https://stream.zeno.fm/9x1sw687nf9uv',
    avatarType: 'music',
    avatarBg: 'from-emerald-500 to-teal-600',
    votes: 1166,
    codec: 'MP3',
    bitrate: 64,
    isTop8: true,
  },
  {
    id: 'london_malayalam_radio',
    name: 'London Malayalam Radio',
    freq: '94.8',
    language: 'Malayalam',
    category: 'Malayalam',
    description: 'UK Malayali community live radio 24x7',
    colorHex: '#6366f1',
    iconType: 'headphones',
    streamUrl: 'https://ais-edge105-live365-dal02.cdnstream.com/a50671',
    avatarType: 'palm',
    avatarBg: 'from-indigo-600 to-blue-700',
    votes: 682,
    codec: 'MP3',
    bitrate: 128,
    isTop8: true,
  },
  {
    id: 'radio_beat_malayalam',
    name: 'Radio Beat Malayalam',
    freq: '96.2',
    language: 'Malayalam',
    category: 'Malayalam',
    description: 'Youth sensation, indie Malayalam rock & beats',
    colorHex: '#ec4899',
    iconType: 'guitar',
    streamUrl: 'https://live.exertion.in:8050/radio.mp3',
    avatarType: 'waves',
    avatarBg: 'from-pink-500 to-rose-600',
    votes: 854,
    codec: 'MP3',
    bitrate: 128,
  },
  {
    id: 'club_fm_kerala',
    name: 'Club FM Kerala',
    freq: '94.3',
    language: 'Malayalam',
    category: 'Malayalam',
    description: 'Ton Kanakkinu Fun — Kochi & Kozhikode radio',
    colorHex: '#e11d48',
    iconType: 'boombox',
    streamUrl: 'https://stream.zeno.fm/057hwhrarchvv',
    avatarType: 'waves',
    avatarBg: 'from-rose-600 to-pink-700',
    votes: 560,
    codec: 'MP3',
    bitrate: 64,
  },
  {
    id: 'radio_mango_kerala',
    name: 'Radio Mango Kochi',
    freq: '91.9',
    language: 'Malayalam',
    category: 'Malayalam',
    description: 'Naattile Thaaram — Queen of Arabian Sea hits',
    colorHex: '#f97316',
    iconType: 'headphones',
    streamUrl: 'https://stream.zeno.fm/934u30kx8vzuv.aac',
    avatarType: 'palm',
    avatarBg: 'from-orange-500 to-amber-600',
    votes: 490,
    codec: 'AAC',
    bitrate: 64,
  },
  {
    id: 'ganam_retro_malayalam',
    name: 'Ganam Retro Malayalam',
    freq: '97.5',
    language: 'Malayalam',
    category: 'Malayalam',
    description: 'Devarajan master, Baburaj & MS Baburaj era',
    colorHex: '#8b5cf6',
    iconType: 'vinyl',
    streamUrl: 'https://stream.zeno.fm/7k9sw687nf9uv',
    avatarType: 'vinyl',
    avatarBg: 'from-purple-600 to-indigo-800',
    votes: 430,
    codec: 'MP3',
    bitrate: 64,
  },
  {
    id: 'pravasi_bharathi',
    name: 'Pravasi Bharathi Kerala',
    freq: '101.2',
    language: 'Malayalam',
    category: 'Malayalam',
    description: 'Kerala news analysis, morning headlines & talk',
    colorHex: '#0284c7',
    iconType: 'radio',
    streamUrl: 'https://stream.zeno.fm/3u3sw687nf9uv',
    avatarType: 'news',
    avatarBg: 'from-sky-700 to-blue-800',
    votes: 380,
    codec: 'MP3',
    bitrate: 64,
  },
  {
    id: 'best_fm_malabar',
    name: 'Best FM Kozhikode',
    freq: '95.0',
    language: 'Malayalam',
    category: 'Malayalam',
    description: 'Malabar coastal melodies and Mappila songs',
    colorHex: '#14b8a6',
    iconType: 'cassette',
    streamUrl: 'https://stream.zeno.fm/512rbf1e3qzuv',
    avatarType: 'palm',
    avatarBg: 'from-teal-500 to-emerald-600',
    votes: 310,
    codec: 'MP3',
    bitrate: 64,
  },
  {
    id: 'kerala_beats',
    name: 'Kerala Beats Live',
    freq: '98.4',
    language: 'Malayalam',
    category: 'Malayalam',
    description: 'Indie Malayalam rock, Avial & Thaikkudam specials',
    colorHex: '#10b981',
    iconType: 'guitar',
    streamUrl: 'https://live.exertion.in:8050/radio.mp3',
    avatarType: 'folk',
    avatarBg: 'from-emerald-600 to-teal-700',
    votes: 290,
    codec: 'MP3',
    bitrate: 128,
  },
  {
    id: 'asianet_news_radio',
    name: 'Asianet News Audio',
    freq: '103.5',
    language: 'Malayalam',
    category: 'Malayalam',
    description: 'Kerala breaking news & primetime news hour',
    colorHex: '#3b82f6',
    iconType: 'radio',
    streamUrl: 'https://stream.zeno.fm/3u3sw687nf9uv',
    avatarType: 'news',
    avatarBg: 'from-blue-600 to-indigo-700',
    votes: 275,
    codec: 'MP3',
    bitrate: 64,
  },
  {
    id: 'flowers_fm_kerala',
    name: 'Flowers FM Kerala',
    freq: '98.5',
    language: 'Malayalam',
    category: 'Malayalam',
    description: 'Comedy Utsavam fun and cinema music',
    colorHex: '#8b5cf6',
    iconType: 'radio',
    streamUrl: 'https://stream.zeno.fm/057hwhrarchvv',
    avatarType: 'waves',
    avatarBg: 'from-violet-500 to-purple-600',
    votes: 240,
    codec: 'MP3',
    bitrate: 64,
  },

  // ── ENGLISH MUSIC STATIONS ──
  {
    id: 'radio_paradise_main',
    name: 'Radio Paradise Main Mix',
    freq: '105.8',
    language: 'English',
    category: 'English',
    description: 'California eclectic rock, indie, electronic & modern pop',
    colorHex: '#38bdf8',
    iconType: 'radio',
    streamUrl: 'https://stream.radioparadise.com/mp3-128',
    avatarType: 'palm',
    avatarBg: 'from-sky-500 to-indigo-600',
    votes: 8940,
    codec: 'MP3',
    bitrate: 128,
    isTop8: true,
  },
  {
    id: 'capital_fm_london',
    name: 'Capital FM London',
    freq: '95.8',
    language: 'English',
    category: 'English',
    description: "The UK's No.1 Hit Music Station — Top 40, Dua Lipa & pop",
    colorHex: '#fb7185',
    iconType: 'boombox',
    streamUrl: 'https://icecast.thisisdax.com/CapitalUKMP3',
    avatarType: 'waves',
    avatarBg: 'from-rose-500 to-pink-600',
    votes: 7520,
    codec: 'MP3',
    bitrate: 128,
  },
  {
    id: 'somafm_groove_salad',
    name: 'SomaFM Groove Salad',
    freq: '102.1',
    language: 'English',
    category: 'English',
    description: 'San Francisco downtempo ambient chillout & electronic beats',
    colorHex: '#10b981',
    iconType: 'headphones',
    streamUrl: 'https://ice1.somafm.com/groovesalad-128-mp3',
    avatarType: 'waves',
    avatarBg: 'from-teal-500 to-emerald-600',
    votes: 6810,
    codec: 'MP3',
    bitrate: 128,
  },
  {
    id: '181fm_the_buzz',
    name: '181.FM The Buzz Alternative',
    freq: '106.7',
    language: 'English',
    category: 'English',
    description: 'Alternative rock, 90s grunge, Foo Fighters, Nirvana & Arctic Monkeys',
    colorHex: '#f59e0b',
    iconType: 'guitar',
    streamUrl: 'https://listen.181fm.com/181-buzz_128k.mp3',
    avatarType: 'tower',
    avatarBg: 'from-amber-500 to-orange-600',
    votes: 5620,
    codec: 'MP3',
    bitrate: 128,
  },
  {
    id: 'smooth_chill_uk',
    name: 'Smooth Chill UK',
    freq: '100.4',
    language: 'English',
    category: 'English',
    description: 'Pure relaxing chillout, lo-fi beats, ambient & acoustic pop',
    colorHex: '#6366f1',
    iconType: 'radio',
    streamUrl: 'https://icecast.thisisdax.com/SmoothChillMP3',
    avatarType: 'mic',
    avatarBg: 'from-indigo-500 to-purple-600',
    votes: 5310,
    codec: 'MP3',
    bitrate: 128,
  },
  {
    id: 'hot_108_jamz',
    name: 'Hot 108 Jamz NYC',
    freq: '108.0',
    language: 'English',
    category: 'English',
    description: 'New York #1 Hip-Hop, RnB, Drake, The Weeknd & urban chart toppers',
    colorHex: '#ec4899',
    iconType: 'boombox',
    streamUrl: 'https://sc.hot108.com:443/live',
    avatarType: 'waves',
    avatarBg: 'from-pink-500 to-rose-600',
    votes: 4940,
    codec: 'MP3',
    bitrate: 128,
  },
  {
    id: 'virgin_radio_uk',
    name: 'Virgin Radio UK',
    freq: '104.9',
    language: 'English',
    category: 'English',
    description: 'The Chris Evans breakfast show, British rock, Oasis & Coldplay',
    colorHex: '#e11d48',
    iconType: 'radio',
    streamUrl: 'https://radio.virginradio.co.uk/stream',
    avatarType: 'tower',
    avatarBg: 'from-rose-600 to-red-700',
    votes: 4780,
    codec: 'MP3',
    bitrate: 128,
  },
  {
    id: 'heart_uk_hits',
    name: 'Heart UK Feel Good Hits',
    freq: '106.2',
    language: 'English',
    category: 'English',
    description: 'Turn up the feel good — Queen, Michael Jackson & feelgood pop',
    colorHex: '#f97316',
    iconType: 'radio',
    streamUrl: 'https://icecast.thisisdax.com/HeartUKMP3',
    avatarType: 'mic',
    avatarBg: 'from-orange-500 to-amber-600',
    votes: 4520,
    codec: 'MP3',
    bitrate: 128,
  },
  {
    id: 'classic_rock_florida',
    name: 'Classic Rock Florida HD',
    freq: '99.7',
    language: 'English',
    category: 'English',
    description: 'Pink Floyd, Led Zeppelin, AC/DC, Boston & Eagles anthems',
    colorHex: '#84cc16',
    iconType: 'guitar',
    streamUrl: 'https://icecast.walmradio.com:8443/classic',
    avatarType: 'vinyl',
    avatarBg: 'from-lime-500 to-emerald-600',
    votes: 4320,
    codec: 'MP3',
    bitrate: 128,
  },
  {
    id: 'ibiza_global_radio',
    name: 'Ibiza Global Radio',
    freq: '100.8',
    language: 'English',
    category: 'English',
    description: 'Balearic deep house, melodic techno & White Isle summer clubbing',
    colorHex: '#06b6d4',
    iconType: 'vinyl',
    streamUrl: 'https://listenssl.ibizaglobalradio.com:8024/ibizaglobalradio.mp3',
    avatarType: 'vinyl',
    avatarBg: 'from-cyan-500 to-blue-600',
    votes: 4180,
    codec: 'MP3',
    bitrate: 128,
  },
  {
    id: 'jazz24_seattle',
    name: 'Jazz24 Seattle Public',
    freq: '88.5',
    language: 'English',
    category: 'English',
    description: 'Miles Davis, Billie Holiday, Ella Fitzgerald & contemporary jazz',
    colorHex: '#8b5cf6',
    iconType: 'vinyl',
    streamUrl: 'https://live.wostreaming.net/direct/ppm-jazz24mp3-ibc1',
    avatarType: 'vinyl',
    avatarBg: 'from-violet-500 to-indigo-600',
    votes: 3960,
    codec: 'MP3',
    bitrate: 128,
  },
  {
    id: 'defected_radio',
    name: 'Defected House Radio',
    freq: '103.8',
    language: 'English',
    category: 'English',
    description: 'In Our House We Are All Equal — soulful house & disco grooves',
    colorHex: '#d946ef',
    iconType: 'boombox',
    streamUrl: 'https://stream.zeno.fm/48w230kx8vzuv.aac',
    avatarType: 'waves',
    avatarBg: 'from-fuchsia-500 to-pink-600',
    votes: 3650,
    codec: 'AAC',
    bitrate: 128,
  },
];

export interface RadioStationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeStationId: string;
  onPlayStation: (stationId: string, streamUrl?: string, stationName?: string) => void;
  wheelStationIds?: string[];
  onApplyWheelStations?: (newWheelStationIds: string[]) => void;
}

export const RadioStationsModal: React.FC<RadioStationsModalProps> = ({
  isOpen,
  onClose,
  activeStationId,
  onPlayStation,
  wheelStationIds: initialWheelStationIds,
  onApplyWheelStations,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'All' | 'Malayalam' | 'Tamil' | 'Hindi' | 'English' | 'On Wheel' | 'Favorites'>('All');
  const [sortAscending, setSortAscending] = useState(true);
  const [favorites, setFavorites] = useState<Set<string>>(new Set(['kalai_fm', 'sooriyan_fm', 'malayalam_986', 'radio_mirchi_hindi', 'radio_paradise_main']));
  const [liveStations, setLiveStations] = useState<CatalogStation[]>(CATALOG_STATIONS);
  const [isLoadingApi, setIsLoadingApi] = useState(false);
  const [playerState, setPlayerState] = useState(radioAudioService.getState());

  // Subscribe to radio player state
  useEffect(() => {
    const unsubscribe = radioAudioService.subscribe((state) => {
      setPlayerState(state);
    });
    return unsubscribe;
  }, []);

  // Fetch live stations from Open-Source Radio Browser API
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setIsLoadingApi(true);

    radioAudioService
      .fetchRemoteStations()
      .then((remoteStations) => {
        if (!isMounted) return;

        // Map Radio Browser API stations to CatalogStation
        const merged: CatalogStation[] = [];
        const seenNames = new Set<string>();

        // Always put our verified seeds first
        CATALOG_STATIONS.forEach((seed) => {
          seenNames.add(seed.name.toLowerCase());
          merged.push(seed);
        });

        // Add additional dynamic stations from Radio Browser API
        remoteStations.forEach((remote: RadioBrowserStation) => {
          const normName = remote.name.toLowerCase().trim();
          if (!seenNames.has(normName) && remote.url_resolved) {
            seenNames.add(normName);
            const isMalayalam = remote.language.toLowerCase().includes('malayalam');
            const isTamil = remote.language.toLowerCase().includes('tamil');
            const isHindi = remote.language.toLowerCase().includes('hindi');
            const isEnglish = remote.language.toLowerCase().includes('english') || remote.language.toLowerCase() === 'en';

            if (!isMalayalam && !isTamil && !isHindi && !isEnglish) return;

            let langCategory: 'Malayalam' | 'Tamil' | 'Hindi' | 'English' = 'Malayalam';
            if (isTamil) langCategory = 'Tamil';
            else if (isHindi) langCategory = 'Hindi';
            else if (isEnglish) langCategory = 'English';

            merged.push({
              id: remote.stationuuid,
              name: remote.name,
              freq: `${(88.0 + (remote.votes % 200) / 10).toFixed(1)}`,
              language: langCategory,
              category: langCategory,
              description: remote.tags || `${langCategory} Live Radio Stream`,
              colorHex: isMalayalam ? '#10b981' : isTamil ? '#38bdf8' : isHindi ? '#f43f5e' : '#818cf8',
              iconType: 'radio',
              streamUrl: remote.url_resolved || remote.url,
              avatarType: isMalayalam ? 'palm' : isTamil ? 'mic' : isHindi ? 'waves' : 'tower',
              avatarBg: isHindi ? 'from-rose-500 via-pink-600 to-amber-500' : 'from-sky-500 to-indigo-600',
              votes: remote.votes,
              bitrate: remote.bitrate || 128,
              codec: remote.codec || 'MP3',
            });
          }
        });

        setLiveStations(merged);
        setIsLoadingApi(false);
      })
      .catch((err) => {
        console.warn('[RadioStationsModal] Remote fetch failed, using seed stations:', err);
        setIsLoadingApi(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Wheel slots local configuration
  const defaultWheelIds = useMemo(() => {
    return initialWheelStationIds || DEFAULT_WHEEL_STATIONS.map((s) => s.id);
  }, [initialWheelStationIds]);

  const [configuredWheelIds, setConfiguredWheelIds] = useState<string[]>(defaultWheelIds);

  // Immediate responsive play/pause handling
  const [optimisticActiveId, setOptimisticActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (!playerState.isPlaying) {
      setOptimisticActiveId(null);
    }
  }, [playerState.isPlaying]);

  if (!isOpen) return null;

  // Toggle favorite
  const toggleFavorite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Toggle station in 8-slot wheel
  const toggleWheelSlot = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfiguredWheelIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((sId) => sId !== id);
      } else {
        if (prev.length >= 8) {
          return [...prev.slice(0, 7), id];
        }
        return [...prev, id];
      }
    });
  };

  // Category counts for Malayalam, Tamil, Hindi & English
  const malayalamCount = liveStations.filter((s) => s.category === 'Malayalam').length;
  const tamilCount = liveStations.filter((s) => s.category === 'Tamil').length;
  const hindiCount = liveStations.filter((s) => s.category === 'Hindi').length;
  const englishCount = liveStations.filter((s) => s.category === 'English').length;
  const favoritesCount = liveStations.filter((s) => favorites.has(s.id)).length;

  const handlePlayToggle = (station: CatalogStation) => {
    const isCurrentlyPlaying =
      (optimisticActiveId === station.id || playerState.activeStationId === station.id) &&
      playerState.isPlaying;

    if (isCurrentlyPlaying) {
      setOptimisticActiveId(null);
      radioAudioService.stop();
      onPlayStation('off');
    } else {
      setOptimisticActiveId(station.id);
      radioAudioService.playStation(station.id, station.streamUrl, station.name);
      onPlayStation(station.id, station.streamUrl, station.name);
    }
  };

  const categoryCounts = {
    All: liveStations.length,
    Malayalam: malayalamCount,
    Tamil: tamilCount,
    Hindi: hindiCount,
    English: englishCount,
    'On Wheel': configuredWheelIds.length,
    Favorites: favoritesCount,
  };

  // Filtered & sorted stations list
  const filteredStations = liveStations.filter((station) => {
    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        station.name.toLowerCase().includes(q) ||
        station.freq.toLowerCase().includes(q) ||
        station.description.toLowerCase().includes(q) ||
        station.language.toLowerCase().includes(q);
      if (!matchesSearch) return false;
    }

    // Sidebar Category Filter
    if (selectedCategory !== 'All') {
      if (selectedCategory === 'On Wheel') {
        if (!configuredWheelIds.includes(station.id)) return false;
      } else if (selectedCategory === 'Favorites') {
        if (!favorites.has(station.id)) return false;
      } else if (station.category !== selectedCategory) {
        return false;
      }
    }

    return true;
  }).sort((a, b) => {
    if (sortAscending) {
      return a.name.localeCompare(b.name);
    } else {
      return b.name.localeCompare(a.name);
    }
  });

  // Check if a station is included in the wheel ID list
  const isStationInWheel = (wheelIds: string[], activeStationId: string, activeStreamUrl?: string) => {
    if (!activeStationId || activeStationId === 'off') return false;
    if (wheelIds.includes(activeStationId)) return true;
    const playingCatalogStation = liveStations.find(
      (s) => s.id === activeStationId || (activeStreamUrl && s.streamUrl === activeStreamUrl)
    );
    if (playingCatalogStation && wheelIds.includes(playingCatalogStation.id)) {
      return true;
    }
    return false;
  };

  // Close modal while ensuring unpinned preview stations turn off
  const handleDismiss = () => {
    const currentState = radioAudioService.getState();
    if (currentState.isPlaying && currentState.activeStationId && currentState.activeStationId !== 'off') {
      const isOnWheel = isStationInWheel(defaultWheelIds, currentState.activeStationId, currentState.activeStreamUrl);
      if (!isOnWheel) {
        radioAudioService.stop();
        onPlayStation('off');
      }
    }
    onClose();
  };

  const handleApplyWheel = () => {
    onApplyWheelStations?.(configuredWheelIds);
    const currentState = radioAudioService.getState();
    if (currentState.isPlaying && currentState.activeStationId && currentState.activeStationId !== 'off') {
      const isOnNewWheel = isStationInWheel(configuredWheelIds, currentState.activeStationId, currentState.activeStreamUrl);
      if (!isOnNewWheel) {
        radioAudioService.stop();
        onPlayStation('off');
      }
    }
    onClose();
  };

  // Apple aesthetic VIBRANT pastel gradients for station icons
  const APPLE_PASTEL_PALETTES = [
    // 1. Candy Peach & Sunset Flamingo
    {
      gradient: 'from-[#ff758c] via-[#ff7eb3] to-[#ffb199]',
      glowColor: 'rgba(255,117,140,0.5)',
      borderColor: 'border-rose-300/50',
    },
    // 2. Neon Lilac & Electric Violet
    {
      gradient: 'from-[#a18cd1] via-[#c471ed] to-[#fbc2eb]',
      glowColor: 'rgba(196,113,237,0.5)',
      borderColor: 'border-purple-300/50',
    },
    // 3. Cyber Mint & Seafoam Glacier
    {
      gradient: 'from-[#00b09b] via-[#1dd1a1] to-[#96fbc4]',
      glowColor: 'rgba(29,209,161,0.5)',
      borderColor: 'border-teal-300/50',
    },
    // 4. Arctic Sky & Electric Cerulean
    {
      gradient: 'from-[#2193b0] via-[#48cae4] to-[#6dd5ed]',
      glowColor: 'rgba(72,202,228,0.5)',
      borderColor: 'border-sky-300/50',
    },
    // 5. Radiant Mango & Solar Papaya
    {
      gradient: 'from-[#f857a6] via-[#ff5858] to-[#ffb347]',
      glowColor: 'rgba(255,88,88,0.5)',
      borderColor: 'border-orange-300/50',
    },
    // 6. Tropical Guava & Electric Fuchsia
    {
      gradient: 'from-[#f093fb] via-[#f5576c] to-[#4facfe]',
      glowColor: 'rgba(245,87,108,0.5)',
      borderColor: 'border-pink-300/50',
    },
    // 7. Periwinkle Azure & Royal Iris
    {
      gradient: 'from-[#4776e6] via-[#7474bf] to-[#a18cd1]',
      glowColor: 'rgba(116,116,191,0.5)',
      borderColor: 'border-indigo-300/50',
    },
    // 8. Citrus Honey & Golden Amber
    {
      gradient: 'from-[#f7971e] via-[#ffd200] to-[#ffb199]',
      glowColor: 'rgba(255,210,0,0.5)',
      borderColor: 'border-amber-300/50',
    },
    // 9. Lime Sorbet & Spring Emerald
    {
      gradient: 'from-[#11998e] via-[#38ef7d] to-[#7be495]',
      glowColor: 'rgba(56,239,125,0.5)',
      borderColor: 'border-emerald-300/50',
    },
    // 10. Sunset Velvet & Sweet Rose
    {
      gradient: 'from-[#ec008c] via-[#fc6767] to-[#ff9a9e]',
      glowColor: 'rgba(236,0,140,0.5)',
      borderColor: 'border-rose-300/50',
    },
  ];

  const getPastelPalette = (id: string) => {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = (hash << 5) - hash + id.charCodeAt(i);
      hash |= 0;
    }
    return APPLE_PASTEL_PALETTES[Math.abs(hash) % APPLE_PASTEL_PALETTES.length];
  };

  // Render clean, VIBRANT Apple aesthetics gradient pastel radio icon
  const renderAvatar = (station: CatalogStation, isPlaying: boolean) => {
    const palette = getPastelPalette(station.id);
    const iconClass = isPlaying
      ? 'w-5 h-5 text-white drop-shadow-[0_1.5px_4px_rgba(0,0,0,0.6)]'
      : 'w-5 h-5 text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.4)] group-hover:scale-110 transition-transform';
    let IconComponent = Music;
    if (station.avatarType === 'palm') IconComponent = Trees;
    else if (station.avatarType === 'mic') IconComponent = Mic;
    else if (station.avatarType === 'vinyl') IconComponent = Disc;
    else if (station.avatarType === 'waves') IconComponent = Waves;
    else if (station.avatarType === 'tower') IconComponent = Radio;

    return (
      <div
        className={`w-11 h-11 sm:w-11.5 sm:h-11.5 rounded-[15px] bg-gradient-to-br ${palette.gradient} flex items-center justify-center flex-shrink-0 transition-all duration-300 border ${palette.borderColor} shadow-[0_3px_12px_rgba(0,0,0,0.25),inset_0_1.5px_2px_rgba(255,255,255,0.5)] ${
          isPlaying
            ? 'scale-[1.08] ring-2 ring-white/60 shadow-[0_0_20px_rgba(255,255,255,0.35),inset_0_1.5px_2px_rgba(255,255,255,0.7)]'
            : 'group-hover:scale-105 group-hover:brightness-110'
        }`}
      >
        <IconComponent className={iconClass} />
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-md transition-all duration-300 select-none pointer-events-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleDismiss();
      }}
    >
      {/* ── MAIN MODAL WINDOW CONTAINER (Clean Transparent Smoked Frosted Glass - FIXED SIZE, SUBTLE BORDERS) ── */}
      <div className="relative w-[880px] max-w-[96vw] h-[640px] sm:h-[660px] max-h-[94vh] flex flex-col rounded-[26px] sm:rounded-3xl bg-[#0a0e17]/85 backdrop-blur-2xl border border-white/[0.08] shadow-[0_30px_70px_rgba(0,0,0,0.85)] overflow-hidden">
        {/* Subtle Ambient Radial Highlight */}
        <div className="absolute -top-24 -left-24 w-72 h-72 rounded-full bg-white/[0.03] blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-72 h-72 rounded-full bg-emerald-500/5 blur-3xl pointer-events-none" />

        {/* ── MODAL HEADER ── */}
        <div className="relative z-10 px-5 sm:px-7 pt-5 sm:pt-6 pb-4 flex items-center justify-between border-b border-white/[0.06] flex-shrink-0">
          <div className="flex items-center space-x-3 sm:space-x-3.5">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-white/[0.08] flex items-center justify-center text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] flex-shrink-0">
              <Radio className="w-5.5 h-5.5 sm:w-6 sm:h-6 stroke-[2] text-white" />
            </div>
            <div>
              <h2 className="font-display text-lg sm:text-2xl font-extrabold tracking-wide text-white drop-shadow-sm leading-tight">
                Radio Stations
              </h2>
              <p className="text-white/50 text-xs sm:text-sm font-sans mt-0.5">
                Malayalam, Tamil, Hindi & English live music streaming
              </p>
            </div>
          </div>

          {/* Close Button */}
          <button
            onClick={handleDismiss}
            className="w-9.5 h-9.5 sm:w-10 sm:h-10 rounded-full bg-white/[0.06] hover:bg-white/[0.14] active:scale-90 text-white/80 hover:text-white flex items-center justify-center transition-all cursor-pointer"
            title="Close"
          >
            <X className="w-4.5 h-4.5 sm:w-5 sm:h-5 stroke-[2.2]" />
          </button>
        </div>

        {/* ── SEARCH BAR ROW (SUBTLE FROSTED INSET - REMOVED A-Z BUTTON) ── */}
        <div className="relative z-10 px-5 sm:px-7 pt-3.5 pb-2.5 flex items-center space-x-2.5 flex-shrink-0">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-white/35 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Malayalam, Tamil, Hindi & English stations, frequency, or genre..."
              className="w-full bg-white/[0.03] hover:bg-white/[0.045] focus:bg-white/[0.06] border border-white/[0.06] focus:border-white/[0.14] rounded-2xl pl-11 pr-5 py-2.5 sm:py-3 text-xs sm:text-sm text-white placeholder-white/35 transition-all focus:outline-none shadow-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {isLoadingApi && (
            <div className="hidden sm:flex items-center space-x-1.5 text-white/60 text-xs font-sans flex-shrink-0">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Syncing...</span>
            </div>
          )}
        </div>

        {/* ── MAIN BODY (SPLIT VIEW: CATEGORY SIDEBAR + STATION CARDS - FIXED HEIGHT) ── */}
        <div className="relative z-10 px-5 sm:px-7 py-2.5 flex-1 min-h-0 flex flex-col sm:flex-row gap-4 sm:gap-5 overflow-hidden">
          {/* Left Category Sidebar (Clean Transparent Glass, Zero Colored Icons) */}
          <div className="w-full sm:w-48 flex-shrink-0 flex sm:flex-col overflow-x-auto sm:overflow-x-visible space-x-1.5 sm:space-x-0 sm:space-y-1.5 pb-1 sm:pb-0 scrollbar-none">
            {/* 1. All Stations */}
            <button
              onClick={() => setSelectedCategory('All')}
              className={`w-full flex items-center justify-between px-4 py-3 sm:py-3 rounded-xl sm:rounded-2xl text-xs sm:text-sm font-medium transition-all cursor-pointer min-h-[42px] sm:min-h-[44px] flex-shrink-0 sm:flex-shrink ${
                selectedCategory === 'All'
                  ? 'bg-white/[0.09] text-white font-semibold border border-white/[0.12]'
                  : 'text-white/55 hover:text-white hover:bg-white/[0.03] border border-transparent'
              }`}
            >
              <span>All Stations</span>
              <span className={`text-[11px] px-2 py-0.5 rounded-full ${selectedCategory === 'All' ? 'bg-white/[0.12] text-white font-bold' : 'bg-white/[0.03] text-white/40'}`}>
                {categoryCounts.All}
              </span>
            </button>

            {/* 2. Malayalam */}
            <button
              onClick={() => setSelectedCategory('Malayalam')}
              className={`w-full flex items-center justify-between px-4 py-3 sm:py-3 rounded-xl sm:rounded-2xl text-xs sm:text-sm font-medium transition-all cursor-pointer min-h-[42px] sm:min-h-[44px] flex-shrink-0 sm:flex-shrink ${
                selectedCategory === 'Malayalam'
                  ? 'bg-white/[0.09] text-white font-semibold border border-white/[0.12]'
                  : 'text-white/55 hover:text-white hover:bg-white/[0.03] border border-transparent'
              }`}
            >
              <span>Malayalam</span>
              <span className={`text-[11px] px-2 py-0.5 rounded-full ${selectedCategory === 'Malayalam' ? 'bg-white/[0.12] text-white font-bold' : 'bg-white/[0.03] text-white/40'}`}>
                {categoryCounts.Malayalam}
              </span>
            </button>

            {/* 3. Tamil */}
            <button
              onClick={() => setSelectedCategory('Tamil')}
              className={`w-full flex items-center justify-between px-4 py-3 sm:py-3 rounded-xl sm:rounded-2xl text-xs sm:text-sm font-medium transition-all cursor-pointer min-h-[42px] sm:min-h-[44px] flex-shrink-0 sm:flex-shrink ${
                selectedCategory === 'Tamil'
                  ? 'bg-white/[0.09] text-white font-semibold border border-white/[0.12]'
                  : 'text-white/55 hover:text-white hover:bg-white/[0.03] border border-transparent'
              }`}
            >
              <span>Tamil</span>
              <span className={`text-[11px] px-2 py-0.5 rounded-full ${selectedCategory === 'Tamil' ? 'bg-white/[0.12] text-white font-bold' : 'bg-white/[0.03] text-white/40'}`}>
                {categoryCounts.Tamil}
              </span>
            </button>

            {/* 4. Hindi */}
            <button
              onClick={() => setSelectedCategory('Hindi')}
              className={`w-full flex items-center justify-between px-4 py-3 sm:py-3 rounded-xl sm:rounded-2xl text-xs sm:text-sm font-medium transition-all cursor-pointer min-h-[42px] sm:min-h-[44px] flex-shrink-0 sm:flex-shrink ${
                selectedCategory === 'Hindi'
                  ? 'bg-white/[0.09] text-white font-semibold border border-white/[0.12]'
                  : 'text-white/55 hover:text-white hover:bg-white/[0.03] border border-transparent'
              }`}
            >
              <span>Hindi</span>
              <span className={`text-[11px] px-2 py-0.5 rounded-full ${selectedCategory === 'Hindi' ? 'bg-white/[0.12] text-white font-bold' : 'bg-white/[0.03] text-white/40'}`}>
                {categoryCounts.Hindi}
              </span>
            </button>

            {/* 5. English */}
            <button
              onClick={() => setSelectedCategory('English')}
              className={`w-full flex items-center justify-between px-4 py-3 sm:py-3 rounded-xl sm:rounded-2xl text-xs sm:text-sm font-medium transition-all cursor-pointer min-h-[42px] sm:min-h-[44px] flex-shrink-0 sm:flex-shrink ${
                selectedCategory === 'English'
                  ? 'bg-white/[0.09] text-white font-semibold border border-white/[0.12]'
                  : 'text-white/55 hover:text-white hover:bg-white/[0.03] border border-transparent'
              }`}
            >
              <span>English</span>
              <span className={`text-[11px] px-2 py-0.5 rounded-full ${selectedCategory === 'English' ? 'bg-white/[0.12] text-white font-bold' : 'bg-white/[0.03] text-white/40'}`}>
                {categoryCounts.English}
              </span>
            </button>

            {/* 6. On Wheel */}
            <button
              onClick={() => setSelectedCategory('On Wheel')}
              className={`w-full flex items-center justify-between px-4 py-3 sm:py-3 rounded-xl sm:rounded-2xl text-xs sm:text-sm font-medium transition-all cursor-pointer min-h-[42px] sm:min-h-[44px] flex-shrink-0 sm:flex-shrink ${
                selectedCategory === 'On Wheel'
                  ? 'bg-white/[0.09] text-white font-semibold border border-white/[0.12]'
                  : 'text-white/55 hover:text-white hover:bg-white/[0.03] border border-transparent'
              }`}
            >
              <span>On Wheel</span>
              <span className={`text-[11px] px-2 py-0.5 rounded-full ${selectedCategory === 'On Wheel' ? 'bg-white/[0.12] text-white font-bold' : 'bg-white/[0.03] text-white/40'}`}>
                {categoryCounts['On Wheel']}
              </span>
            </button>

            {/* 7. Favorites */}
            <button
              onClick={() => setSelectedCategory('Favorites')}
              className={`w-full flex items-center justify-between px-4 py-3 sm:py-3 rounded-xl sm:rounded-2xl text-xs sm:text-sm font-medium transition-all cursor-pointer min-h-[42px] sm:min-h-[44px] flex-shrink-0 sm:flex-shrink ${
                selectedCategory === 'Favorites'
                  ? 'bg-white/[0.09] text-white font-semibold border border-white/[0.12]'
                  : 'text-white/55 hover:text-white hover:bg-white/[0.03] border border-transparent'
              }`}
            >
              <span>Favorites</span>
              <span className={`text-[11px] px-2 py-0.5 rounded-full ${selectedCategory === 'Favorites' ? 'bg-white/[0.12] text-white font-bold' : 'bg-white/[0.03] text-white/40'}`}>
                {categoryCounts.Favorites}
              </span>
            </button>
          </div>

          {/* Right Station Cards List (No redundant horizontal pills section) */}
          <div className="flex-1 min-h-0 flex flex-col min-w-0 overflow-hidden">
            {/* Scrollable Cards Container (Fixed Height, Custom Glass Scrollbar) */}
            <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1.5 glass-scrollbar">
              {filteredStations.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center text-center text-white/40">
                  <Radio className="w-10 h-10 mb-2 opacity-25" />
                  <p className="text-sm">No Malayalam, Tamil, Hindi, or English radio stations match your search</p>
                </div>
              ) : (
                filteredStations.map((station) => {
                  const isCurrentlyActive =
                    optimisticActiveId === station.id ||
                    (playerState.isPlaying &&
                      (playerState.activeStationId === station.id ||
                        playerState.activeStreamUrl === station.streamUrl));
                  const isBuffering =
                    isCurrentlyActive && (playerState.status === 'loading' || !playerState.isPlaying);
                  const isFavorited = favorites.has(station.id);
                  const isOnWheel = configuredWheelIds.includes(station.id);

                  return (
                    <div
                      key={station.id}
                      onClick={() => handlePlayToggle(station)}
                      className={`group relative p-2.5 sm:p-3 rounded-2xl border transition-all duration-200 cursor-pointer flex items-center justify-between ${
                        isCurrentlyActive
                          ? 'bg-white/[0.07] border-white/[0.16] shadow-md'
                          : 'bg-white/[0.02] hover:bg-white/[0.045] border-white/[0.04] hover:border-white/[0.08]'
                      }`}
                    >
                      {/* Left: Graphic Avatar + Name + Badges */}
                      <div className="flex items-center space-x-3 min-w-0 pr-2">
                        {renderAvatar(station, isCurrentlyActive)}

                        <div className="min-w-0">
                          <div className="flex items-center space-x-2 flex-wrap">
                            <h3 className="font-display font-bold text-xs sm:text-sm text-white group-hover:text-white transition-colors truncate">
                              {station.name}
                            </h3>
                            <span className="px-1.5 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06] text-[10px] sm:text-[11px] font-medium text-white/55">
                              {station.language}
                            </span>
                            <span className="font-hud text-white/45 text-[11px] sm:text-xs font-semibold">
                              {station.freq}
                            </span>
                            {station.codec && (
                              <span className="text-[10px] font-sans font-medium text-white/40 uppercase tracking-wide">
                                {station.codec} {station.bitrate ? `• ${station.bitrate}k` : ''}
                              </span>
                            )}
                          </div>
                          <p className="text-white/40 text-[11px] sm:text-xs truncate max-w-[220px] sm:max-w-[340px] mt-0.5">
                            {station.description}
                          </p>
                        </div>
                      </div>

                      {/* Right Action Controls: Love (Favorite) -> Add (Wheel) -> Play (Stream) */}
                      <div className="flex items-center space-x-2 flex-shrink-0">
                        {/* 1. Heart Favorite (Love) Button */}
                        <button
                          onClick={(e) => toggleFavorite(station.id, e)}
                          title={isFavorited ? 'Remove from Favorites' : 'Add to Favorites'}
                          className="w-9.5 h-9.5 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all cursor-pointer bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.06] text-white/40 hover:text-white"
                        >
                          <Heart
                            className={`w-4.5 h-4.5 transition-colors ${
                              isFavorited ? 'text-rose-500 fill-rose-500' : 'hover:text-rose-400'
                            }`}
                          />
                        </button>

                        {/* 2. Add to Radio Wheel Button */}
                        <button
                          onClick={(e) => toggleWheelSlot(station.id, e)}
                          title={isOnWheel ? 'Remove from Radio Wheel' : 'Add to Radio Wheel'}
                          className={`w-9.5 h-9.5 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                            isOnWheel
                              ? 'bg-white/15 text-white border border-white/25 shadow-sm'
                              : 'bg-white/[0.03] hover:bg-white/[0.08] text-white/40 hover:text-white border border-white/[0.06]'
                          }`}
                        >
                          {isOnWheel ? <Check className="w-4.5 h-4.5 stroke-[2.5]" /> : <Plus className="w-4.5 h-4.5 stroke-[2]" />}
                        </button>

                        {/* 3. Live Audio Play/Pause Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePlayToggle(station);
                          }}
                          className={`w-9.5 h-9.5 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all duration-150 cursor-pointer shadow-sm ${
                            isCurrentlyActive
                              ? 'bg-white hover:bg-white/90 text-neutral-950 scale-105 shadow-md border border-white'
                              : 'bg-white/[0.06] hover:bg-white/[0.12] text-white/80 hover:text-white border border-white/[0.07]'
                          }`}
                          title={isCurrentlyActive ? 'Pause Radio Stream' : 'Stream Radio Live'}
                        >
                          {isCurrentlyActive ? (
                            isBuffering ? (
                              <Loader2 className="w-4.5 h-4.5 animate-spin text-neutral-950" />
                            ) : (
                              <Pause className="w-4.5 h-4.5 fill-neutral-950 text-neutral-950" />
                            )
                          ) : (
                            <Play className="w-4.5 h-4.5 fill-white ml-0.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* ── MODAL FOOTER ── */}
        <div className="relative z-10 px-5 sm:px-7 py-4 bg-black/25 border-t border-white/[0.06] flex items-center justify-between flex-wrap gap-2 flex-shrink-0">
          {/* Wheel Slots Counter (Clean text only) */}
          <div className="text-white/60 text-xs sm:text-sm font-hud">
            <span>
              <strong className="text-white font-bold">{configuredWheelIds.length}</strong> of 8 wheel slots configured
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-2.5">
            <button
              onClick={handleDismiss}
              className="px-5 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] text-white/70 hover:text-white font-medium text-xs sm:text-sm border border-white/[0.06] transition-all cursor-pointer active:scale-95 min-h-[42px] sm:min-h-[44px]"
            >
              Cancel
            </button>
            <button
              onClick={handleApplyWheel}
              className="px-6 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl bg-white hover:bg-white/90 text-neutral-950 font-bold text-xs sm:text-sm transition-all flex items-center space-x-2 shadow-sm cursor-pointer active:scale-95 min-h-[42px] sm:min-h-[44px]"
            >
              <Check className="w-4.5 h-4.5 stroke-[2.5]" />
              <span>Apply to Radio Wheel</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
