type Reactions = {
  appointment: number;
  future_call: number;
  not_interested: number;
  not_fit: number;
  unknown: number;
};

type ProfileRow = {
  profile: string;
  total: number;
  reactions: Reactions;
};

type AngleRow = { angle: string; total: number };
type AttributionRow = { value: string; total: number };

const reactionLabels: Record<keyof Reactions, string> = {
  appointment: "Agenda",
  future_call: "Llamar a futuro",
  not_interested: "No interesado",
  not_fit: "No encaja",
  unknown: "Sin resultado",
};

export function buildReactionChartData(reactions?: Reactions) {
  if (!reactions) return [];
  return (Object.entries(reactions) as [keyof Reactions, number][])
    .filter(([, value]) => value > 0)
    .map(([key, value]) => ({ key, name: reactionLabels[key], value }));
}

export type FeedbackChartItem = {
  key: string;
  name: string;
  value: number;
};

export function buildFeedbackChartData({
  profiles,
  angles,
  sources,
  campaigns,
  profileLabels,
  angleLabels,
}: {
  profiles: readonly ProfileRow[];
  angles: readonly AngleRow[];
  sources: readonly AttributionRow[];
  campaigns: readonly AttributionRow[];
  profileLabels: Readonly<Record<string, string>>;
  angleLabels: Readonly<Record<string, string>>;
}) {
  const reactions = profiles.reduce<Reactions>(
    (totals, profile) => {
      for (const key of Object.keys(totals) as (keyof Reactions)[]) {
        totals[key] += profile.reactions[key];
      }
      return totals;
    },
    { appointment: 0, future_call: 0, not_interested: 0, not_fit: 0, unknown: 0 },
  );

  return {
    profiles: profiles.map(({ profile, total }) => ({
      key: profile,
      name: profileLabels[profile] ?? profile,
      value: total,
    })),
    reactions: buildReactionChartData(reactions),
    angles: angles.map(({ angle, total }) => ({
      key: angle,
      name: angleLabels[angle] ?? angle,
      value: total,
    })),
    sources: sources.map(({ value, total }) => ({
      key: value,
      name: value,
      value: total,
    })),
    campaigns: campaigns.map(({ value, total }) => ({
      key: value,
      name: value,
      value: total,
    })),
  };
}
