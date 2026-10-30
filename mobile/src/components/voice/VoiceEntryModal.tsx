import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { voiceApi, type VoiceParsedResult } from '@/api/voice';
import { toApiError } from '@/api/errors';
import { AppText } from '@/components/ui/AppText';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { TextField } from '@/components/ui/TextField';
import { colors, radius } from '@/theme';

interface VoiceEntryModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function VoiceEntryModal({ visible, onClose, onSuccess }: VoiceEntryModalProps) {
  const [transcript, setTranscript] = useState('');
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parsed, setParsed] = useState<VoiceParsedResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resetState = () => {
    setTranscript('');
    setParsed(null);
    setError(null);
    setParsing(false);
    setSaving(false);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleParse = async () => {
    if (!transcript.trim()) {
      setError('Please type a health sentence first.');
      return;
    }
    setError(null);
    setParsing(true);
    try {
      const res = await voiceApi.parse(transcript.trim());
      if (!res.metric_type || res.metric_type === 'UNKNOWN') {
        setError("Could not identify the metric. Try: 'Drank 500ml water' or 'Slept 7.5 hours' or 'Blood pressure was 120/80'.");
        setParsed(null);
      } else {
        setParsed(res);
      }
    } catch (e) {
      setError(toApiError(e).message);
      setParsed(null);
    } finally {
      setParsing(false);
    }
  };

  const handleConfirmSave = async () => {
    if (!parsed) return;
    setSaving(true);
    setError(null);
    try {
      await voiceApi.confirmSave({
        metric_type: parsed.metric_type,
        fields: parsed.fields,
      });
      Alert.alert('Saved', `${parsed.metric_type} entry recorded successfully.`);
      handleClose();
      onSuccess();
    } catch (e) {
      setError(toApiError(e).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <MaterialCommunityIcons name="lightning-bolt" size={24} color={colors.primary} />
              <AppText variant="h2" style={styles.title}>Quick Health Entry</AppText>
            </View>
            <Pressable onPress={handleClose} accessibilityLabel="Close entry modal" style={styles.closeBtn}>
              <MaterialCommunityIcons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          <AppText variant="caption" color="textSubtle" style={styles.subtitle}>
            Quickly type a natural health sentence. Our parser extracts values for your confirmation before saving.
          </AppText>

          {error ? <Banner kind="error" message={error} /> : null}

          {!parsed ? (
            <View style={styles.body}>
              <TextField
                label="Health sentence"
                placeholder="e.g. Drank 500ml water or Slept 8 hours"
                value={transcript}
                onChangeText={setTranscript}
                multiline
                numberOfLines={3}
              />

              <View style={styles.examples}>
                <AppText variant="caption" color="textMuted">Examples:</AppText>
                <Pressable onPress={() => setTranscript('I drank 500ml of water today')}>
                <AppText variant="caption" color="primary">• &quot;I drank 500ml of water today&quot;</AppText>
                </Pressable>
                <Pressable onPress={() => setTranscript('Logged 7.5 hours of sleep last night')}>
                <AppText variant="caption" color="primary">• &quot;Logged 7.5 hours of sleep last night&quot;</AppText>
                </Pressable>
                <Pressable onPress={() => setTranscript('My blood pressure was 120 over 80')}>
                <AppText variant="caption" color="primary">• &quot;My blood pressure was 120 over 80&quot;</AppText>
                </Pressable>
              </View>

              <Button
                label="Parse Entry"
                icon="check"
                loading={parsing}
                onPress={() => void handleParse()}
                style={styles.actionBtn}
              />
            </View>
          ) : (
            <View style={styles.body}>
              <Card style={styles.confirmCard}>
                <AppText variant="caption" color="primary" style={styles.confirmBadge}>
                  Detected: {parsed.metric_type}
                </AppText>
                <View style={styles.fieldsList}>
                  {Object.entries(parsed.fields).map(([k, v]) => (
                    <View key={k} style={styles.fieldRow}>
                      <AppText variant="caption" color="textMuted">{k.replace(/_/g, ' ')}:</AppText>
                      <AppText variant="bodyStrong">{String(v)}</AppText>
                    </View>
                  ))}
                </View>
                <AppText variant="caption" color="textSubtle" style={styles.notice}>
                  Review the values above. Confirm to save to your active profile.
                </AppText>
              </Card>

              <View style={styles.btnRow}>
                <Button
                  label="Try another"
                  variant="secondary"
                  onPress={() => setParsed(null)}
                  style={styles.flexBtn}
                />
                <Button
                  label="Confirm & Save"
                  variant="primary"
                  icon="content-save"
                  loading={saving}
                  onPress={() => void handleConfirmSave()}
                  style={styles.flexBtn}
                />
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: 20, maxHeight: '85%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 18 },
  closeBtn: { padding: 4 },
  subtitle: { marginBottom: 16 },
  body: { gap: 14 },
  examples: { gap: 6, marginVertical: 4 },
  actionBtn: { marginTop: 8 },
  confirmCard: { padding: 16, gap: 10, backgroundColor: colors.surfaceSubtle },
  confirmBadge: { fontWeight: '700', textTransform: 'uppercase' },
  fieldsList: { gap: 6 },
  fieldRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  notice: { marginTop: 4, fontStyle: 'italic' },
  btnRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  flexBtn: { flex: 1 },
});
