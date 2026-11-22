import { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Image, TextInput, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import { trainingApi, trainingAssetUrl, TrainingModuleContent, TrainingSummary } from '../../src/services/api';
import { useAuthStore } from '../../src/store/auth.store';
import { PrimaryButton, ui } from '../../src/components/onboarding/OnboardingUI';
import { colors } from '../../src/theme';

// The training player: each screen shows a picture and short text while the
// narration plays (replay, pause, sound off). Then three questions; a wrong
// pick shows why and they try again. Then the technician confirms with their
// name, and the server records the completion (it re-checks the answers).
type Phase = 'screens' | 'questions' | 'confirm' | 'done';
const posKey = (key: string, version: number) => `training-pos:${key}:${version}`;
const SOUND_KEY = 'training-sound';

export default function TrainingModuleScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const navigation = useNavigation();
  const { user } = useAuthStore();
  const [mod, setMod] = useState<TrainingModuleContent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('screens');
  const [index, setIndex] = useState(0);
  const [soundOn, setSoundOn] = useState(true);

  // Questions
  const [q, setQ] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [firstTry, setFirstTry] = useState(0);
  const missedThis = useRef(false);

  // Confirm
  const [name, setName] = useState(`${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim());
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<TrainingSummary | null>(null);

  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    AsyncStorage.getItem(SOUND_KEY).then((v) => { if (v === 'off') setSoundOn(false); }).catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const m = await trainingApi.getModule(String(key));
        setMod(m);
        navigation.setOptions({ title: m.title });
        const saved = await AsyncStorage.getItem(posKey(m.key, m.version)).catch(() => null);
        const n = saved ? Number(saved) : 0;
        if (n > 0 && n < m.screens.length) setIndex(n);
      } catch (e: any) {
        setError(e.message === 'NETWORK_ERROR' ? 'Could not reach Attenteve. Check your connection.' : e.message);
      }
    })();
  }, [key]);

  // Load and play the narration for the current screen.
  const audioUrl = mod && phase === 'screens' ? trainingAssetUrl(mod.screens[index]?.audioUrl ?? null) : null;
  useEffect(() => {
    if (!audioUrl) { player.pause(); return; }
    player.replace({ uri: audioUrl });
    if (soundOn) player.play();
  }, [audioUrl]);

  useEffect(() => () => { try { player.pause(); } catch {} }, []);

  useEffect(() => {
    if (mod && phase === 'screens') AsyncStorage.setItem(posKey(mod.key, mod.version), String(index)).catch(() => {});
  }, [index, phase, mod]);

  if (error) {
    return (
      <View style={[ui.screen, ui.content]}>
        <View style={ui.warnBox}><Text style={ui.warnText}>{error}</Text></View>
        <PrimaryButton label="Back to My Training" onPress={() => router.replace('/(vendor)/training')} />
      </View>
    );
  }
  if (!mod) return <ActivityIndicator style={{ flex: 1 }} color={colors.lanternDeep} size="large" />;

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    AsyncStorage.setItem(SOUND_KEY, next ? 'on' : 'off').catch(() => {});
    if (!next) player.pause();
    else if (audioUrl) player.play();
  };
  const replay = async () => {
    if (!audioUrl) return;
    await player.seekTo(0);
    player.play();
    if (!soundOn) { setSoundOn(true); AsyncStorage.setItem(SOUND_KEY, 'on').catch(() => {}); }
  };
  const playPause = () => (status.playing ? player.pause() : player.play());

  // ── Screens ──────────────────────────────────────────────────────────────
  if (phase === 'screens') {
    const s = mod.screens[index];
    const img = trainingAssetUrl(s.imageUrl);
    const last = index === mod.screens.length - 1;
    return (
      <View style={ui.screen}>
        <ScrollView contentContainerStyle={styles.body}>
          <Dots count={mod.screens.length + 1} at={index} />
          <View style={styles.picture}>
            {img
              ? <Image source={{ uri: img }} style={styles.pictureImg} resizeMode="contain" accessibilityLabel={s.title} />
              : <Ionicons name="image-outline" size={48} color={colors.steel} />}
          </View>
          <Text style={styles.screenTitle}>{s.title}</Text>
          <Text style={styles.screenText}>{s.text}</Text>

          {audioUrl && (
            <View style={styles.audioRow}>
              <AudioButton icon="refresh" label="Replay" onPress={replay} />
              {soundOn && <AudioButton icon={status.playing ? 'pause' : 'play'} label={status.playing ? 'Pause' : 'Play'} onPress={playPause} />}
              <AudioButton icon={soundOn ? 'volume-high' : 'volume-mute'} label={soundOn ? 'Sound on' : 'Sound off'} onPress={toggleSound} />
            </View>
          )}
        </ScrollView>
        <View style={styles.footer}>
          <TouchableOpacity style={[styles.backBtn, index === 0 && { opacity: 0.4 }]} disabled={index === 0} onPress={() => setIndex(index - 1)}>
            <Ionicons name="chevron-back" size={20} color={colors.ink} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.nextBtn}
            onPress={() => {
              if (last) { player.pause(); setPhase('questions'); } else setIndex(index + 1);
            }}
          >
            <Text style={styles.nextText}>{last ? 'Questions' : 'Next'}</Text>
            <Ionicons name="chevron-forward" size={20} color={colors.ink} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Questions ────────────────────────────────────────────────────────────
  if (phase === 'questions') {
    const question = mod.questions[q];
    const answered = picked !== null;
    const right = answered && picked === question.correct;
    const choose = (i: number) => {
      if (right) return;
      setPicked(i);
      setAttempts((a) => a + 1);
      if (i === question.correct) {
        if (!missedThis.current) setFirstTry((n) => n + 1);
      } else {
        missedThis.current = true;
      }
    };
    const next = () => {
      setPicked(null);
      missedThis.current = false;
      if (q === mod.questions.length - 1) setPhase('confirm');
      else setQ(q + 1);
    };
    return (
      <View style={ui.screen}>
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.eyebrow}>Question {q + 1} of {mod.questions.length}</Text>
          <Text style={styles.question}>{question.question}</Text>
          {question.choices.map((c, i) => {
            const isPicked = picked === i;
            const style = isPicked ? (i === question.correct ? styles.choiceRight : styles.choiceWrong) : null;
            return (
              <TouchableOpacity key={i} style={[styles.choice, style]} onPress={() => choose(i)} disabled={right}>
                <Text style={styles.choiceText}>{c}</Text>
                {isPicked && (
                  <Ionicons
                    name={i === question.correct ? 'checkmark-circle' : 'close-circle'}
                    size={22}
                    color={i === question.correct ? colors.success : colors.danger}
                  />
                )}
              </TouchableOpacity>
            );
          })}
          {answered && !right && (
            <View style={ui.warnBox}>
              <Text style={ui.warnText}>{question.explanation} Try again.</Text>
            </View>
          )}
          {right && (
            <View style={ui.onFile}>
              <Ionicons name="checkmark-circle" size={18} color={colors.successText} />
              <Text style={ui.onFileText}>Correct.</Text>
            </View>
          )}
        </ScrollView>
        <View style={styles.footer}>
          <TouchableOpacity style={styles.backBtn} onPress={() => { setPicked(null); setPhase('screens'); }}>
            <Ionicons name="chevron-back" size={20} color={colors.ink} />
            <Text style={styles.backText}>Lesson</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.nextBtn, !right && { opacity: 0.4 }]} disabled={!right} onPress={next}>
            <Text style={styles.nextText}>{q === mod.questions.length - 1 ? 'Finish' : 'Next'}</Text>
            <Ionicons name="chevron-forward" size={20} color={colors.ink} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Confirm ──────────────────────────────────────────────────────────────
  if (phase === 'confirm') {
    const submit = async () => {
      setSaving(true);
      try {
        const summary = await trainingApi.complete(mod.key, {
          version: mod.version,
          answers: mod.questions.map((x) => x.correct),
          attempts,
          answersCorrectFirstTry: firstTry,
          confirmedName: name,
        });
        AsyncStorage.removeItem(posKey(mod.key, mod.version)).catch(() => {});
        setResult(summary);
        setPhase('done');
      } catch (e: any) {
        Alert.alert('Could not save', e.message === 'NETWORK_ERROR' ? 'Check your connection and try again.' : e.message);
      } finally {
        setSaving(false);
      }
    };
    return (
      <KeyboardAvoidingView style={ui.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Ionicons name="create-outline" size={40} color={colors.lanternDeep} style={{ alignSelf: 'center', marginVertical: 12 }} />
          <Text style={[styles.screenTitle, { textAlign: 'center' }]}>Confirm your training</Text>
          <Text style={[styles.screenText, { textAlign: 'center' }]}>
            “I completed this training and will follow it.”
          </Text>
          <Text style={ui.label}>Your full name</Text>
          <TextInput
            style={ui.textInput}
            value={name}
            onChangeText={setName}
            placeholder="First and last name"
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="done"
          />
          <PrimaryButton label="I confirm" onPress={submit} loading={saving} disabled={name.trim().length < 2} />
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ── Done ─────────────────────────────────────────────────────────────────
  const nextModule = result?.modules.find((m) => m.status !== 'DONE');
  return (
    <View style={[ui.screen, styles.body, { justifyContent: 'center' }]}>
      <Ionicons name="checkmark-circle" size={72} color={colors.success} style={{ alignSelf: 'center' }} />
      <Text style={[styles.screenTitle, { textAlign: 'center', marginTop: 12 }]}>
        {result?.allDone ? 'All training done' : 'Module complete'}
      </Text>
      <Text style={[styles.screenText, { textAlign: 'center' }]}>
        {result?.allDone
          ? 'Thank you. Jobs for your services now show in Open Jobs. We emailed you a confirmation.'
          : `${result?.doneCount ?? 0} of ${result?.requiredCount ?? 0} done.${result?.coreDone ? '' : ' Jobs show once the core training is done.'}`}
      </Text>
      {nextModule ? (
        <PrimaryButton
          label={`Next: ${nextModule.title}`}
          onPress={() => router.replace({ pathname: '/(vendor)/training-module', params: { key: nextModule.key } })}
        />
      ) : (
        <PrimaryButton label="See open jobs" onPress={() => router.replace('/(vendor)/requests')} />
      )}
      <TouchableOpacity onPress={() => router.replace('/(vendor)/training')} style={{ padding: 14, alignItems: 'center' }}>
        <Text style={ui.link}>Back to My Training</Text>
      </TouchableOpacity>
    </View>
  );
}

function Dots({ count, at }: { count: number; at: number }) {
  return (
    <View style={styles.dots}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.dot, i <= at && styles.dotOn, i === count - 1 && styles.dotQuiz]} />
      ))}
    </View>
  );
}

function AudioButton({ icon, label, onPress }: { icon: any; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.audioBtn} onPress={onPress} accessibilityLabel={label}>
      <Ionicons name={icon} size={18} color={colors.lanternDeep} />
      <Text style={styles.audioText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 32 },
  dots: { flexDirection: 'row', gap: 6, justifyContent: 'center', marginBottom: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotOn: { backgroundColor: colors.lantern },
  dotQuiz: { borderRadius: 2 },
  picture: {
    height: 280, borderRadius: 16, backgroundColor: colors.mist, alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', marginBottom: 16, borderWidth: 1, borderColor: colors.border,
  },
  pictureImg: { width: '100%', height: '100%' },
  screenTitle: { fontSize: 21, fontWeight: '800', color: colors.ink, marginBottom: 8 },
  screenText: { fontSize: 17, color: colors.ink, lineHeight: 25, marginBottom: 16 },
  audioRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  audioBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderColor: colors.lanternDeep,
    borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7,
  },
  audioText: { fontSize: 13, fontWeight: '700', color: colors.lanternDeep },
  footer: {
    flexDirection: 'row', justifyContent: 'space-between', gap: 12, padding: 12, paddingBottom: 20,
    borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 14, borderRadius: 12 },
  backText: { fontSize: 16, fontWeight: '700', color: colors.ink },
  nextBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    backgroundColor: colors.lantern, borderRadius: 12, paddingVertical: 14,
  },
  nextText: { fontSize: 16, fontWeight: '800', color: colors.ink },
  eyebrow: { fontSize: 12.5, fontWeight: '800', color: colors.lanternDeep, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 },
  question: { fontSize: 19, fontWeight: '800', color: colors.ink, lineHeight: 26, marginBottom: 14 },
  choice: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderWidth: 1.5,
    borderColor: colors.border, borderRadius: 12, padding: 14, marginBottom: 10,
  },
  choiceRight: { borderColor: colors.success, backgroundColor: colors.successSoft },
  choiceWrong: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  choiceText: { flex: 1, fontSize: 15.5, color: colors.ink, lineHeight: 21 },
});
