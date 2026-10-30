import { api } from './client';

export interface VoiceParsedResult {
  metric_type: string;
  fields: Record<string, any>;
  confidence: number;
  unrecognized_entities: string[];
  requires_confirmation: boolean;
  transcript: string;
}

export interface VoiceSavePayload {
  metric_type: string;
  fields: Record<string, any>;
  target_date?: string;
}

export const voiceApi = {
  async parse(transcript: string): Promise<VoiceParsedResult> {
    const { data } = await api.post<VoiceParsedResult>('/voice/parse', { transcript });
    return data;
  },
  async confirmSave(payload: VoiceSavePayload): Promise<any> {
    const { data } = await api.post('/voice/confirm-save', payload);
    return data;
  },
};
