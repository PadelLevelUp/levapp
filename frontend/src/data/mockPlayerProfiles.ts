import type { PlayerProfile } from "@/types";

function profile(
  playerId: string,
  evaluations: [string, number][],
  strengths: string[],
  weaknesses: string[],
): PlayerProfile {
  return {
    playerId,
    evaluations: evaluations.map(([topic, score]) => ({ topic, score })),
    strengths,
    weaknesses,
  };
}

export const mockPlayerProfiles: Record<string, PlayerProfile> = {
  "player-1": profile(
    "player-1",
    [["Technique", 78], ["Tactics", 65], ["Physical Capacity", 82], ["Attitude", 90]],
    ["Strong forehand", "Excellent court positioning", "High stamina"],
    ["Weak backhand under pressure", "Slow net transitions"],
  ),
  "player-2": profile(
    "player-2",
    [["Technique", 70], ["Tactics", 80], ["Physical Capacity", 60], ["Attitude", 85]],
    ["Smart play selection", "Good doubles partner"],
    ["Needs conditioning improvement", "Inconsistent serve"],
  ),
  "player-3": profile(
    "player-3",
    [["Technique", 55], ["Tactics", 50], ["Physical Capacity", 70], ["Attitude", 95]],
    ["Very motivated", "Great attitude in training"],
    ["Technique still developing", "Tactical awareness needs work"],
  ),
  "player-4": profile(
    "player-4",
    [["Technique", 85], ["Tactics", 75], ["Physical Capacity", 68], ["Attitude", 72]],
    ["Natural racket skills", "Powerful smash"],
    ["Sometimes unfocused", "Endurance could improve"],
  ),
  "player-5": profile(
    "player-5",
    [["Technique", 62], ["Tactics", 58], ["Physical Capacity", 90], ["Attitude", 88]],
    ["Exceptional fitness", "Never gives up on a point"],
    ["Technical polish needed", "Rushing shots"],
  ),
  "player-6": profile(
    "player-6",
    [["Technique", 80], ["Tactics", 72], ["Physical Capacity", 75], ["Attitude", 80]],
    ["Consistent baseline play", "Good volleys"],
    ["Could be more aggressive", "Second serve needs work"],
  ),
  "player-7": profile(
    "player-7",
    [["Technique", 48], ["Tactics", 45], ["Physical Capacity", 55], ["Attitude", 92]],
    ["Eager to learn", "Positive team player"],
    ["Beginner level technique", "Needs match experience"],
  ),
  "player-8": profile(
    "player-8",
    [["Technique", 73], ["Tactics", 68], ["Physical Capacity", 72], ["Attitude", 78]],
    ["Well-rounded game", "Reliable under pressure"],
    ["Lacks a standout weapon", "Footwork could improve"],
  ),
};
