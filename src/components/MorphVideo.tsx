"use client";

interface MorphVideoProps {
  size: "large" | "small";
}

export default function MorphVideo({ size }: MorphVideoProps) {
  const dimension = size === "large" ? 260 : 80;

  return (
    <div
      className={size === "large" ? "anim-float" : "anim-float-small"}
      style={{ width: dimension, height: dimension }}
    >
      <video
        autoPlay
        loop
        muted
        playsInline
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          borderRadius: "50%",
        }}
      >
        <source src="/plotline-animation.webm" type="video/webm" />
        <source src="/plotline-animation.mp4" type="video/mp4" />
      </video>
    </div>
  );
}
