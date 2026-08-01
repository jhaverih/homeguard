import { Text, TextStyle, StyleProp } from 'react-native';

// "CarePlus" renders as one word with "Plus" in the accent color — same
// technique as "Attenteve"'s "eve" and "eveAi"'s "Ai" (AttenteveLogo.tsx,
// (customer)/_layout.tsx's EveAiTitle): a neutral prefix + an accented
// suffix. Every other plan name renders plainly.
export function PlanName({ name, style }: { name: string; style?: StyleProp<TextStyle> }) {
  if (name !== 'CarePlus') {
    return <Text style={style}>{name}</Text>;
  }
  return (
    <Text style={style}>
      <Text style={{ color: '#12181C' }}>Care</Text>
      <Text style={{ color: '#C97F1F' }}>Plus</Text>
    </Text>
  );
}
