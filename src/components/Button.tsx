"use client";

import React from "react";

interface ButtonProps {
  variant?: "primary" | "secondary";
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}

export default function Button({
  variant = "primary",
  disabled = false,
  onClick,
  children,
  className = "",
}: ButtonProps) {
  if (variant === "primary") {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className={`
          gold-gradient-bg
          text-[#0a0a08] font-sans text-[16px] font-bold uppercase tracking-widest
          py-[22px] px-[56px] rounded-none
          transition-opacity
          disabled:opacity-40 disabled:cursor-not-allowed
          ${className}
        `}
        style={{ borderRadius: 0 }}
      >
        {children}
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        bg-transparent border-2 border-border text-text-dim
        font-sans text-[16px] font-bold uppercase tracking-widest
        py-[22px] px-[56px] rounded-none
        transition-colors
        hover:border-gold-dark hover:text-text
        disabled:opacity-40 disabled:cursor-not-allowed
        ${className}
      `}
      style={{ borderRadius: 0 }}
    >
      {children}
    </button>
  );
}
