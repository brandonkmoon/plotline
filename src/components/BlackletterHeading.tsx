interface BlackletterHeadingProps {
  children: React.ReactNode;
  as?: "h1" | "h2";
  size?: string;
  className?: string;
}

export default function BlackletterHeading({
  children,
  as: Tag = "h1",
  size = "88px",
  className = "",
}: BlackletterHeadingProps) {
  return (
    <Tag
      className={`font-display leading-none ${className}`}
      style={{
        fontSize: size,
        textShadow:
          "2px 2px 0 rgba(0,0,0,.85), 0 0 30px rgba(212,168,67,.2)",
      }}
    >
      {children}
    </Tag>
  );
}
