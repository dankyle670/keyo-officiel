import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, View } from "react-native";
import { router, type Href } from "expo-router";
import { StatusBar } from "expo-status-bar";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { color } from "@keyo/tokens";
import { DkSymbol } from "@/brand/Logo";
import { getSession, useSession } from "@/data/session";
import { Text } from "@/ui";

const MARK = 112;
const WORD = "keyo";
// Décalage qui place le symbole au centre exact de l'écran, là où le splash natif l'affiche :
// le passage du splash natif à cet écran se fait sans saut.
const START_OFFSET = 61;
const native = { useNativeDriver: true } as const;

/**
 * Écran de démarrage (01-Splash), seul écran à porter la signature DK Group (symbole seul).
 * Séquence d'environ 1,8 s : la serrure se pose, une onde se diffuse, le nom puis la promesse
 * apparaissent ; l'écran s'efface avant d'ouvrir l'app.
 */
export default function Splash() {
  const s = useSession();
  const [introDone, setIntroDone] = useState(false);
  const leaving = useRef(false);

  const markScale = useRef(new Animated.Value(0.92)).current;
  const markShift = useRef(new Animated.Value(START_OFFSET)).current;
  const lockDrop = useRef(new Animated.Value(-14)).current;
  const lockOpacity = useRef(new Animated.Value(0)).current;
  const ripple = useRef(new Animated.Value(0)).current;
  const letters = useRef(WORD.split("").map(() => new Animated.Value(0))).current;
  const tagline = useRef(new Animated.Value(0)).current;
  const signature = useRef(new Animated.Value(0)).current;
  const exit = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled) return;
      if (reduce) {
        // Mouvements réduits : état final directement, sans animation.
        [markScale, lockOpacity, tagline, ...letters].forEach((v) => v.setValue(1));
        markShift.setValue(0);
        lockDrop.setValue(0);
        signature.setValue(0.5);
        setTimeout(() => setIntroDone(true), 900);
        return;
      }
      Animated.sequence([
        // 1. La serrure tombe dans le carré, avec un léger rebond.
        Animated.parallel([
          Animated.spring(markScale, { toValue: 1, friction: 6, tension: 80, ...native }),
          Animated.timing(lockOpacity, { toValue: 1, duration: 220, ...native }),
          Animated.spring(lockDrop, { toValue: 0, friction: 5, tension: 120, ...native }),
        ]),
        // 2. Onde mint (le « clic » de la serrure), et le symbole remonte pour laisser place au nom.
        Animated.parallel([
          Animated.timing(ripple, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), ...native }),
          Animated.timing(markShift, { toValue: 0, duration: 520, easing: Easing.out(Easing.cubic), ...native }),
          // 3. Les lettres apparaissent l'une après l'autre.
          Animated.stagger(
            70,
            letters.map((v) => Animated.timing(v, { toValue: 1, duration: 380, easing: Easing.out(Easing.back(1.6)), ...native })),
          ),
        ]),
        // 4. La promesse, puis la signature DK, discrète.
        Animated.parallel([
          Animated.timing(tagline, { toValue: 1, duration: 360, easing: Easing.out(Easing.quad), ...native }),
          Animated.timing(signature, { toValue: 0.5, duration: 500, ...native }),
        ]),
        Animated.delay(250),
      ]).start(() => !cancelled && setIntroDone(true));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Une fois l'intro jouée et la session chargée : fondu de sortie, puis ouverture de l'app.
  useEffect(() => {
    if (!introDone || s.status === "loading" || leaving.current) return;
    leaving.current = true;
    Animated.timing(exit, { toValue: 1, duration: 260, easing: Easing.in(Easing.quad), ...native }).start(() => router.replace(destination()));
  }, [introDone, s.status]);

  const contentOpacity = exit.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const contentScale = exit.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] });

  return (
    <View style={{ flex: 1, backgroundColor: color.night }}>
      <StatusBar style="light" />
      <Animated.View style={{ flex: 1, opacity: contentOpacity, transform: [{ scale: contentScale }] }}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 18 }}>
          <Animated.View style={{ width: MARK, height: MARK, transform: [{ translateY: markShift }, { scale: markScale }] }}>
            {/* Onde qui se diffuse depuis le symbole */}
            <Animated.View
              pointerEvents="none"
              style={{
                position: "absolute",
                width: MARK,
                height: MARK,
                borderRadius: 30,
                borderWidth: 2,
                borderColor: color.mint,
                opacity: ripple.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.6, 0] }),
                transform: [{ scale: ripple.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] }) }],
              }}
            />
            <Svg width={MARK} height={MARK} viewBox="0 0 64 64" style={{ position: "absolute" }}>
              <Rect width={64} height={64} rx={16} fill={color.nightSoft} />
            </Svg>
            <Animated.View style={{ position: "absolute", opacity: lockOpacity, transform: [{ translateY: lockDrop }] }}>
              <Svg width={MARK} height={MARK} viewBox="0 0 64 64">
                <Circle cx={32} cy={27} r={10} fill={color.mint} />
                <Path d="M27.5 31h9l3.5 18a2 2 0 0 1-2 2.4H26a2 2 0 0 1-2-2.4z" fill={color.mint} />
                <Circle cx={32} cy={27} r={3.6} fill={color.nightSoft} />
              </Svg>
            </Animated.View>
          </Animated.View>

          <View style={{ flexDirection: "row" }} accessibilityLabel="keyo" accessibilityRole="header">
            {WORD.split("").map((ch, i) => (
              <Animated.View
                key={i}
                style={{
                  opacity: letters[i],
                  transform: [{ translateY: letters[i]!.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
                }}
              >
                <Text variant="display" tone="onNight" style={{ fontSize: 64, lineHeight: 70, letterSpacing: -3.2 }}>
                  {ch}
                </Text>
              </Animated.View>
            ))}
          </View>

          <Animated.View style={{ opacity: tagline, transform: [{ translateY: tagline.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}>
            <Text variant="bodyStrong" tone="mint" style={{ fontSize: 17, fontFamily: "PlusJakartaSans_700Bold" }}>
              Vos biens, gérés d'ici.
            </Text>
          </Animated.View>
        </View>

        {/* Signature DK Group : symbole seul, petit et discret. */}
        <Animated.View style={{ position: "absolute", left: 0, right: 0, bottom: 44, alignItems: "center", opacity: signature }}>
          <DkSymbol width={28} />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

function destination(): Href {
  const s = getSession();
  if (s.status !== "signedIn") return "/(auth)/bienvenue";
  if (!s.user.role) return "/(auth)/role";
  if (!s.user.firstName) return "/(auth)/profil";
  return s.user.role === "OWNER" ? "/(owner)" : "/locataire";
}
