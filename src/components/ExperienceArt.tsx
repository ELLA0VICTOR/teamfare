import type { Experience } from "../data";
export function ExperienceArt({ experience }: { experience: Experience }) {
  if (experience.image)
    return (
      <img
        className="experience-art"
        src={experience.image}
        alt={
          experience.id === "long-table"
            ? "A freshly served meal at a candlelit dining table"
            : "A warm restaurant filled with plants and shared tables"
        }
        loading="lazy"
      />
    );
  return (
    <div
      className={`experience-art art-${experience.artwork}`}
      aria-hidden="true"
    >
      {experience.artwork === "clay" ? (
        <>
          <span className="poster-copy">
            MAKE A LITTLE
            <br />
            <i>mess.</i>
          </span>
          <svg viewBox="0 0 460 300">
            <ellipse
              cx="235"
              cy="270"
              rx="151"
              ry="17"
              fill="#d3ad7e"
              opacity=".5"
            />
            <path
              d="M93 134q-18 13-5 87t61 39q45-8 48-51l-8-75Z"
              fill="#b95435"
            />
            <ellipse cx="139" cy="134" rx="50" ry="13" fill="#803c2d" />
            <path
              d="M194 149c59-50 73 51-5 57"
              fill="none"
              stroke="#b95435"
              strokeWidth="17"
            />
            <path
              d="M250 85h57l-7 44q55 25 55 79 0 59-77 59t-75-59q0-54 55-79Z"
              fill="#e5985b"
            />
            <ellipse cx="279" cy="85" rx="29" ry="8" fill="#a45638" />
            <path
              d="M232 190q45-12 91 0m-101 25q55-12 112 0"
              stroke="#b86e44"
              strokeWidth="3"
              fill="none"
            />
            <path d="M313 244q25-45 67-12l-6 29-66-1Z" fill="#e6b675" />
          </svg>
          <span className="poster-foot">NO EXPERIENCE. JUST GOOD COMPANY.</span>
        </>
      ) : (
        <>
          <span className="court-copy">
            A little less desk.
            <br />
            <i>A little more doubles.</i>
          </span>
          <svg viewBox="0 0 460 300">
            <path
              d="m111 272 89-184h138l72 184Z"
              fill="#e8aa75"
              stroke="#f9edd3"
              strokeWidth="3"
            />
            <path
              d="m149 272 72-184m151 184-55-184M155 180h219M166 210h221M268 180v92"
              fill="none"
              stroke="#f9edd3"
              strokeWidth="2"
            />
            <path d="M141 179h245v-15H141Z" fill="#244b3d" stroke="#f9edd3" />
            <circle cx="161" cy="236" r="10" fill="#e3ee83" />
            <path d="M156 229q9 5 7 15" fill="none" stroke="#7f9653" />
            <ellipse
              cx="322"
              cy="226"
              rx="18"
              ry="25"
              transform="rotate(30 322 226)"
              fill="none"
              stroke="#f9edd3"
              strokeWidth="5"
            />
            <path d="m310 246-17 28" stroke="#f9edd3" strokeWidth="7" />
          </svg>
          <span className="poster-foot">ALL SKILL LEVELS. ALL GOOD.</span>
        </>
      )}
    </div>
  );
}
