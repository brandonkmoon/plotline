"use client";

import React from "react";

interface ButtonProps {
  variant?: "primary" | "secondary";
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
  type?: "button" | "submit" | "reset";
}

// Buttons follow the theater-program aesthetic:
//   primary   = solid black, white text
//   secondary = transparent, 2px black border
// Both use Playfair Display, uppercase, wide letter-spacing.

export default function Button({
  variant = "primary",
  disabled = false,
  onClick,
  children,
  className = "",
  type = "button",
}: ButtonProps) {
  const base =
    "w-full font-serif font-medium uppercase cursor-pointer transition-colors disabled:cursor-not-allowed";

  if (variant === "primary") {
    return (
      <button
        type={type}
        onClick={onClick}
        disabled={disabled}
        className={`${base} text-[16px] py-4 px-6 bg-ink text-white hover:bg-[#333] disabled:bg-[#ccc] ${className}`}
        style={{ letterSpacing: "3px", borderRadius: 0 }}
      >
        {children}
      </button>
    );
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} text-[14px] py-3 px-6 bg-transparent text-ink border-2 border-ink hover:bg-ink hover:text-white disabled:border-[#ccc] disabled:text-[#ccc] ${className}`}
      style={{ letterSpacing: "2px", borderRadius: 0 }}
    >
      {children}
    </button>
  );
}
