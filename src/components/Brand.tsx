import { members } from "../data";
export function Brand() {
  return (
    <span className="brand">
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path
          d="M16 16C-3-2 2-9 16 9 30-9 35-2 16 16ZM16 16C35 34 30 41 16 23 2 41-3 34 16 16Z"
          transform="translate(0 -0.5) scale(1 .95)"
        />
      </svg>
      teamfare<span className="brand-period">.</span>
    </span>
  );
}
export function Avatars({
  ids = members.slice(0, 4).map((member) => member.id),
  small = false,
}: {
  ids?: string[];
  small?: boolean;
}) {
  return (
    <div
      className={`avatars ${small ? "avatars-small" : ""}`}
      aria-label={`${ids.length} team members`}
    >
      {ids.slice(0, 4).map((id) => {
        const member = members.find((person) => person.id === id);
        return (
          member && (
            <span
              key={id}
              title={member.name}
              style={{ backgroundColor: member.color }}
            >
              {member.initials}
            </span>
          )
        );
      })}
      {ids.length > 4 && <span className="avatar-more">+{ids.length - 4}</span>}
    </div>
  );
}
