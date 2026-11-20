/**
 * PAD-839 (dashboard.student-setup-guide rule 4): the avatar ring. While the guide's card would
 * show, the account avatar in the tabs header (`app/(tabs)/_layout.tsx`, on every tab) carries a
 * ring filled to the percent — for a student only, never for a coach. Twin of web's
 * `SetupGuideRing` / `SetupGuideAvatar`.
 */
import { lightTheme, type SetupGuideView } from "@levelup/config";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useAuth } from "@/auth/AuthContext";
import { useSetupGuide } from "./useSetupGuide";

const SIZE = 42;
const STROKE = 3;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function SetupGuideRing({ view, children }: { view: SetupGuideView; children: React.ReactNode }) {
  const { t } = useTranslation();
  if (!view.showRing) return <>{children}</>;
  const pct = view.percent ?? 0;
  return (
    <View
      testID="setup-guide-ring"
      accessibilityLabel={view.percent === null ? undefined : t("setupGuide.ring", { percent: pct })}
      accessibilityValue={view.percent === null ? { text: "loading" } : { min: 0, max: 100, now: view.percent }}
      style={{ width: SIZE, height: SIZE, alignItems: "center", justifyContent: "center" }}
    >
      <Svg width={SIZE} height={SIZE} style={{ position: "absolute", top: 0, left: 0 }}>
        <Circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} stroke={lightTheme.muted} strokeWidth={STROKE} fill="none" />
        {pct > 0 ? (
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke={lightTheme.primary}
            strokeWidth={STROKE}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${(CIRCUMFERENCE * pct) / 100} ${CIRCUMFERENCE}`}
            // Start at twelve o'clock, as web's conic gradient does.
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          />
        ) : null}
      </Svg>
      {children}
    </View>
  );
}

function RingFromGuide({ children }: { children: React.ReactNode }) {
  const guide = useSetupGuide();
  return <SetupGuideRing view={guide.view}>{children}</SetupGuideRing>;
}

/** The header avatar, ringed for a student while the guide is open. A coach mounts no guide at all. */
export function SetupGuideAvatar({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const student = user != null && !(user.roles ?? []).includes("coach");
  return student ? <RingFromGuide>{children}</RingFromGuide> : <>{children}</>;
}
