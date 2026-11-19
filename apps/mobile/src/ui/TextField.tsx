import { forwardRef, type ComponentRef, type ReactNode } from "react";
import { TextInput, View, type TextInputProps } from "react-native";
import { color, fontFamily, size } from "@keyo/tokens";
import { Text } from "./Text";

type Props = TextInputProps & { label: string; hint?: string; error?: string; leading?: ReactNode };

/** Champ en pilule (56 px), libellé au-dessus, aide ou erreur en dessous. */
export const TextField = forwardRef<ComponentRef<typeof TextInput>, Props>(function TextField({ label, hint, error, leading, style, ...props }, ref) {
  return (
    <View style={{ marginTop: 20, gap: 8 }}>
      <Text variant="rowSubtitle" tone="inkMuted">
        {label}
      </Text>
      <View
        style={{
          height: size.button,
          borderRadius: 999,
          backgroundColor: color.surfaceRaised,
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 20,
          gap: 10,
          borderWidth: error ? 1.5 : 0,
          borderColor: color.danger,
        }}
      >
        {leading}
        <TextInput
          ref={ref}
          {...props}
          accessibilityLabel={label}
          placeholderTextColor={color.inkMuted}
          style={[{ flex: 1, height: "100%", fontFamily: fontFamily.medium, fontSize: 16, color: color.ink }, style]}
        />
      </View>
      {error ? (
        <Text variant="caption" tone="danger">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="inkMuted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
});
