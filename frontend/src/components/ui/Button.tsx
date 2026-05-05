"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { motion, type HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";

const variants = {
  primary:
    "bg-[#0F766E] text-white hover:bg-[#0D9488] rounded-full",
  secondary:
    "border border-[#0F766E] text-[#0F766E] bg-transparent hover:bg-[#0F766E]/5 rounded-full",
  ghost:
    "bg-transparent text-[#0F766E] hover:bg-[#0F766E]/5 rounded-lg",
} as const;

const sizes = {
  sm: "px-4 py-1.5 text-sm",
  md: "px-6 py-2.5 text-base",
  lg: "px-8 py-3 text-lg",
} as const;

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = "primary", size = "md", asChild = false, ...props },
    ref
  ) => {
    if (asChild) {
      return (
        <Slot
          ref={ref}
          className={cn(
            "inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]/50 disabled:pointer-events-none disabled:opacity-50",
            variants[variant],
            sizes[size],
            className
          )}
          {...props}
        />
      );
    }

    return (
      <motion.button
        ref={ref}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        transition={{ type: "spring", stiffness: 400, damping: 17 }}
        className={cn(
          "inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]/50 disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
          variants[variant],
          sizes[size],
          className
        )}
        {...(props as HTMLMotionProps<"button">)}
      />
    );
  }
);

Button.displayName = "Button";

export { Button };
