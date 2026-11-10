import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';

export type PickedFile = { uri: string; mimeType: string; name: string };

// Camera, photo library or PDF — business documents (registration, insurance,
// licenses) usually arrive as PDFs, so every document upload offers all three.
export function pickDocument(title = 'Add Document'): Promise<PickedFile | null> {
  return new Promise((resolve) => {
    Alert.alert(title, 'Choose source', [
      {
        text: 'Take Photo',
        onPress: async () => {
          const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
          resolve(!result.canceled && result.assets?.length
            ? { uri: result.assets[0].uri, mimeType: 'image/jpeg', name: 'photo.jpg' }
            : null);
        },
      },
      {
        text: 'Photo Library',
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
          resolve(!result.canceled && result.assets?.length
            ? { uri: result.assets[0].uri, mimeType: 'image/jpeg', name: 'photo.jpg' }
            : null);
        },
      },
      {
        text: 'PDF Document',
        onPress: async () => {
          const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf' });
          resolve(!result.canceled && result.assets?.length
            ? { uri: result.assets[0].uri, mimeType: 'application/pdf', name: result.assets[0].name || 'document.pdf' }
            : null);
        },
      },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
    ], { cancelable: true, onDismiss: () => resolve(null) });
  });
}
