import { CircleDot, CupSoda, Paintbrush, Utensils } from "lucide-react";
import type { Experience } from "../data";

export function ExperienceArt({ experience }: { experience: Experience }) {
  const Icon =
    experience.artwork === "clay"
      ? Paintbrush
      : experience.artwork === "court"
        ? CircleDot
        : experience.category === "Good food"
          ? Utensils
          : CupSoda;
  return experience.image ? (
    <img
      className={`experience-image experience-image-${experience.id}`}
      src={experience.image}
      alt={
        experience.id === "long-table"
          ? "A carefully plated meal on a restaurant table"
          : experience.id === "clay"
            ? "Clay-covered hands shaping a bowl on a pottery wheel"
            : experience.id === "court"
              ? "Tennis rackets and a ball resting beside a sunlit court"
              : "Warmly lit dining room with tables set for dinner"
      }
      loading="lazy"
    />
  ) : (
    <div
      className="experience-placeholder"
      role="img"
      aria-label={`${experience.category} illustration; venue photograph pending`}
    >
      <Icon strokeWidth={1} size={64} aria-hidden="true" />
    </div>
  );
}
