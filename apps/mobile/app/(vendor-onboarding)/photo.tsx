import { useState } from 'react';
import { ScrollView, Text, View, Image, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { onboardingApi, uploadsApi, userApi } from '../../src/services/api';
import { useVendorApplication } from '../../src/hooks/useVendorApplication';
import { useAuthStore } from '../../src/store/auth.store';
import { LockedNotice, PrimaryButton, ReviewerNote, Section, ui } from '../../src/components/onboarding/OnboardingUI';
import { colors } from '../../src/theme';

export default function ProfilePhotoScreen() {
  const { app, setApp, loading, item } = useVendorApplication();
  const { setUser } = useAuthStore();
  const [uploading, setUploading] = useState(false);

  if (loading || !app) return <ActivityIndicator style={{ flex: 1 }} color={colors.lanternDeep} size="large" />;
  const status = item('photo');
  const editable = !!status?.editable;

  const choose = async (source: 'camera' | 'library') => {
    const options = { quality: 0.7, allowsEditing: true, aspect: [1, 1] as [number, number] };
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { Alert.alert('Camera access needed', 'Allow camera access in Settings to take your photo.'); return; }
    }
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ ...options, cameraType: ImagePicker.CameraType.front })
      : await ImagePicker.launchImageLibraryAsync({ ...options, mediaTypes: ImagePicker.MediaTypeOptions.Images });
    if (result.canceled || !result.assets?.length) return;

    setUploading(true);
    try {
      const uploaded = await uploadsApi.uploadPhoto(result.assets[0].uri, 'avatars');
      setApp(await onboardingApi.setPhoto(uploaded.key));
      userApi.getMe().then((u: any) => setUser(u)).catch(() => {});
    } catch (e: any) {
      Alert.alert('Upload failed', `${e.message}\n\nYour photo was not saved. Please try again.`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.content}>
      <ReviewerNote note={status?.reviewerNote} />
      {!editable && <LockedNotice />}

      <Section
        title="A clear photo of your face"
        hint="Customers see this photo before you arrive, so they know who to expect at the door. Use a recent, well-lit photo of your face: no logos, sunglasses or group photos."
      >
        <View style={styles.photoWrap}>
          {app.photoUrl
            ? <Image source={{ uri: app.photoUrl }} style={styles.photo} />
            : <View style={[styles.photo, styles.placeholder]}><Ionicons name="person" size={64} color={colors.steel} /></View>}
          {uploading && <ActivityIndicator style={StyleSheet.absoluteFill} color={colors.lanternDeep} size="large" />}
        </View>
        {editable && (
          <>
            <PrimaryButton label={app.photoUrl ? 'Retake photo' : 'Take a photo'} onPress={() => choose('camera')} loading={uploading} />
            <Text style={[ui.link, { textAlign: 'center', marginTop: 14 }]} onPress={() => !uploading && choose('library')}>Choose from library</Text>
          </>
        )}
        <Text style={styles.note}>Every technician you add later needs their own photo before they can see jobs.</Text>
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  photoWrap: { alignSelf: 'center', marginVertical: 12 },
  photo: { width: 160, height: 160, borderRadius: 80 },
  placeholder: { backgroundColor: colors.mist, alignItems: 'center', justifyContent: 'center' },
  note: { fontSize: 12, color: colors.steel, textAlign: 'center', marginTop: 16, lineHeight: 17 },
});
