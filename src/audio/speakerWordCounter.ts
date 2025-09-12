import fs from 'fs';

interface SpeakerCounts {
  [speaker: string]: number;
}

interface DeepgramWord {
  word: string;
  speaker?: number;
}

interface DeepgramResponse {
  results: {
    channels: Array<{
      alternatives: Array<{
        words?: DeepgramWord[];
      }>;
    }>;
  };
}

/**
 * Transcribes an audio file using Deepgram and counts words per speaker.
 * @param filePath Path to the audio file
 * @param apiKey   Deepgram API key
 * @returns mapping of speaker identifiers to word counts
 */
export async function countWordsBySpeaker(
  filePath: string,
  apiKey: string
): Promise<SpeakerCounts> {
  const audio = await fs.promises.readFile(filePath);

  const response = await fetch(
    'https://api.deepgram.com/v1/listen?diarize=true&punctuate=true',
    {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'audio/wav',
      },
      body: audio,
    }
  );

  if (!response.ok) {
    throw new Error(`Deepgram request failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as DeepgramResponse;
  const words =
    data.results.channels[0]?.alternatives[0]?.words ?? [];

  const counts: SpeakerCounts = {};
  for (const w of words) {
    const speaker = w.speaker !== undefined ? `speaker_${w.speaker}` : 'unknown';
    counts[speaker] = (counts[speaker] ?? 0) + 1;
  }

  return counts;
}

if (require.main === module) {
  const [,, audioFile, apiKey] = process.argv;
  if (!audioFile || !apiKey) {
    console.error('Usage: ts-node speakerWordCounter.ts <audio-file> <DEEPGRAM_API_KEY>');
    process.exit(1);
  }
  countWordsBySpeaker(audioFile, apiKey)
    .then((counts) => {
      console.log(counts);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
