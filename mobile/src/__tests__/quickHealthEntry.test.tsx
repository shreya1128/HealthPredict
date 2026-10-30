import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { voiceApi } from '@/api/voice';
import { VoiceEntryModal } from '@/components/voice/VoiceEntryModal';

jest.mock('@/api/voice', () => ({
  voiceApi: {
    parse: jest.fn(),
    confirmSave: jest.fn(),
  },
}));

describe('VoiceEntryModal (Quick Health Entry)', () => {
  const onClose = jest.fn();
  const onSuccess = jest.fn();
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders Quick Health Entry modal with title, guidance, and text input', () => {
    render(<VoiceEntryModal visible={true} onClose={onClose} onSuccess={onSuccess} />);

    expect(screen.getByText('Quick Health Entry')).toBeTruthy();
    expect(screen.getByText(/Quickly type a natural health sentence/i)).toBeTruthy();
    expect(screen.getByPlaceholderText('e.g. Drank 500ml water or Slept 8 hours')).toBeTruthy();
    expect(screen.getByText('Parse Entry')).toBeTruthy();
  });

  it('shows error if submitted without text', async () => {
    render(<VoiceEntryModal visible={true} onClose={onClose} onSuccess={onSuccess} />);

    fireEvent.press(screen.getByText('Parse Entry'));
    await waitFor(() => {
      expect(screen.getByText('Please type a health sentence first.')).toBeTruthy();
    });
    expect(voiceApi.parse).not.toHaveBeenCalled();
  });

  it('calls voiceApi.parse with user input and displays parsed confirmation card', async () => {
    (voiceApi.parse as jest.Mock).mockResolvedValueOnce({
      metric_type: 'HYDRATION',
      fields: { water_intake_ml: 500 },
      confidence: 0.95,
      unrecognized_entities: [],
      requires_confirmation: true,
      transcript: 'I drank 500ml of water',
    });

    render(<VoiceEntryModal visible={true} onClose={onClose} onSuccess={onSuccess} />);

    const input = screen.getByPlaceholderText('e.g. Drank 500ml water or Slept 8 hours');
    fireEvent.changeText(input, 'I drank 500ml of water');

    fireEvent.press(screen.getByText('Parse Entry'));

    await waitFor(() => {
      expect(voiceApi.parse).toHaveBeenCalledWith('I drank 500ml of water');
      expect(screen.getByText('Detected: HYDRATION')).toBeTruthy();
      expect(screen.getByText('500')).toBeTruthy();
    });
  });

  it('saves parsed health entry and invokes onSuccess and closes', async () => {
    (voiceApi.parse as jest.Mock).mockResolvedValueOnce({
      metric_type: 'SLEEP',
      fields: { duration_hours: 8 },
      confidence: 0.92,
      unrecognized_entities: [],
      requires_confirmation: true,
      transcript: 'Slept 8 hours',
    });
    (voiceApi.confirmSave as jest.Mock).mockResolvedValueOnce({ success: true });

    render(<VoiceEntryModal visible={true} onClose={onClose} onSuccess={onSuccess} />);

    const input = screen.getByPlaceholderText('e.g. Drank 500ml water or Slept 8 hours');
    fireEvent.changeText(input, 'Slept 8 hours');
    fireEvent.press(screen.getByText('Parse Entry'));

    await waitFor(() => {
      expect(screen.getByText('Detected: SLEEP')).toBeTruthy();
    });

    const confirmBtn = screen.getByText('Confirm & Save');
    fireEvent.press(confirmBtn);

    await waitFor(() => {
      expect(voiceApi.confirmSave).toHaveBeenCalledWith({
        metric_type: 'SLEEP',
        fields: { duration_hours: 8 },
      });
      expect(alertSpy).toHaveBeenCalledWith('Saved', expect.stringContaining('SLEEP'));
      expect(onSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('handles unrecognized metric with helpful feedback', async () => {
    (voiceApi.parse as jest.Mock).mockResolvedValueOnce({
      metric_type: 'UNKNOWN',
      fields: {},
      confidence: 0.2,
      unrecognized_entities: [],
      requires_confirmation: false,
      transcript: 'hello world',
    });

    render(<VoiceEntryModal visible={true} onClose={onClose} onSuccess={onSuccess} />);

    const input = screen.getByPlaceholderText('e.g. Drank 500ml water or Slept 8 hours');
    fireEvent.changeText(input, 'hello world');
    fireEvent.press(screen.getByText('Parse Entry'));

    await waitFor(() => {
      expect(screen.getByText(/Could not identify the metric/i)).toBeTruthy();
    });
  });
});
