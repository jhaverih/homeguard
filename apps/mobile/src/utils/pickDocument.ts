import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';

export type PickedFile = { uri: string; mimeType: string; name: string };

// Same limit as the API's upload endpoint.
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

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
          const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
          if (result.canceled || !result.assets?.length) { resolve(null); return; }
          const asset = result.assets[0];
          // The server refuses anything over 10 MB, so say so before uploading.
          if (asset.size && asset.size > MAX_UPLOAD_BYTES) {
            Alert.alert('File too large', `That PDF is ${(asset.size / 1024 / 1024).toFixed(1)} MB. Choose a PDF under 10 MB, or take a photo instead.`);
            resolve(null);
            return;
          }
          resolve({ uri: asset.uri, mimeType: 'application/pdf', name: asset.name || 'document.pdf' });
        },
      },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
    ], { cancelable: true, onDismiss: () => resolve(null) });
  });
}
