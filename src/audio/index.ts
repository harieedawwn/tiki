import type { Song } from '../core/types';
import type { AudioEngine } from './engine';
import { localEngine } from './local';
import { youtubeEngine } from './youtube';

export function engineFor(song: Song): AudioEngine {
  return song.source.type === 'youtube' ? youtubeEngine() : localEngine;
}
