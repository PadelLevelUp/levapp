import { useLocalSearchParams } from "expo-router";
import { isSetupGuideStep, SetupGuideScreen } from "@/features/setup-guide/SetupGuideScreen";

/**
 * PAD-839 (dashboard.student-setup-guide rule 5): `/setup-guide` lists the five steps;
 * `/setup-guide?step=<step>` opens one. The screen lives in `src/features/setup-guide/`.
 */
export default function SetupGuideRoute() {
  const { step } = useLocalSearchParams<{ step?: string }>();
  return <SetupGuideScreen step={isSetupGuideStep(step) ? step : null} />;
}
