"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Trash2, ShoppingCart, ArrowRight } from "lucide-react";
import { getCart, removeFromCart, clearCart, checkoutCart } from "@/lib/api";
import { friendlyEnrollmentError } from "@/lib/utils";

interface CartCourse {
  id: number;
  title: string;
  price: number;
  isFree: boolean;
  type?: string; // "COURSE" | "SERVICE"
  instructor: { id: number; fullName: string } | null;
  trainer?: { id: number; fullName: string } | null;
  thumbnailUrl: string | null;
}

export default function CartPage() {
  const router = useRouter();
  const [items, setItems] = useState<CartCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [checkingOut, setCheckingOut] = useState(false);

  const fetchCart = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getCart();
      setItems(data as CartCourse[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load cart");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCart();
  }, []);

  const handleRemove = async (courseId: number) => {
    try {
      await removeFromCart(courseId);
      setItems((prev) => prev.filter((c) => c.id !== courseId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove item");
    }
  };

  const handleClear = async () => {
    try {
      await clearCart();
      setItems([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear cart");
    }
  };

  const handleCheckout = async () => {
    setCheckingOut(true);
    setError("");
    try {
      await checkoutCart();
      router.push("/dashboard");
    } catch (err) {
      setError(friendlyEnrollmentError(err));
      setCheckingOut(false);
    }
  };

  const total = items.reduce((sum, c) => sum + (c.price || 0), 0);

  return (
    <section className="mx-auto max-w-4xl px-6 pt-32 pb-20 min-h-screen" style={{ backgroundColor: "#F0EDE8" }}>
      <h1 className="font-serif text-4xl font-bold text-[#00A3A8] mb-8">Your Cart</h1>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-[#00A3A8]" size={32} />
        </div>
      )}

      {error && (
        <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm mb-6">
          {error}
        </div>
      )}

      {!loading && items.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-20"
        >
          <ShoppingCart className="mx-auto text-gray-300 mb-4" size={64} />
          <p className="text-gray-500 text-lg mb-4">Your cart is empty</p>
          <Link
            href="/courses"
            className="inline-flex items-center gap-2 bg-[#00A3A8] text-white px-6 py-2.5 rounded-full text-sm font-semibold hover:bg-[#00B4B8] transition-colors"
          >
            Browse Courses <ArrowRight size={16} />
          </Link>
        </motion.div>
      )}

      {!loading && items.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <AnimatePresence mode="popLayout">
            {items.map((course) => (
              <motion.div
                key={course.id}
                layout
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20, height: 0 }}
                transition={{ duration: 0.3 }}
                className="flex items-center gap-4 bg-white rounded-xl p-4 mb-3 shadow-sm border border-gray-100"
              >
                <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-[#00A3A8]/10 to-[#00B4B8]/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {course.thumbnailUrl ? (
                    <img src={course.thumbnailUrl} alt={course.title} className="w-full h-full object-cover" />
                  ) : (
                    <ShoppingCart size={20} className="text-[#00A3A8]/40" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900 truncate">{course.title}</h3>
                    <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                      course.type === "SERVICE"
                        ? "bg-violet-100 text-violet-700"
                        : "bg-teal-100 text-teal-700"
                    }`}>
                      {course.type === "SERVICE" ? "Service" : "Course"}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500">
                    {course.type === "SERVICE"
                      ? `by ${course.trainer?.fullName ?? course.instructor?.fullName ?? "Spire Trainer"}`
                      : course.instructor?.fullName || "Unknown instructor"}
                  </p>
                </div>
                <p className="font-semibold text-gray-900 whitespace-nowrap">
                  {course.price > 0 ? `₹${course.price}` : "Free"}
                </p>
                <button
                  onClick={() => handleRemove(course.id)}
                  className="p-2 text-gray-400 hover:text-red-500 transition-colors cursor-pointer"
                  title="Remove from cart"
                >
                  <Trash2 size={18} />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Summary */}
          <div className="mt-8 bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <span className="text-gray-600">Total ({items.length} {items.length === 1 ? "item" : "items"})</span>
              <span className="text-2xl font-bold text-[#00A3A8]">₹{total}</span>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleClear}
                className="px-4 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-full hover:bg-gray-50 transition-colors cursor-pointer"
              >
                Clear Cart
              </button>
              <button
                onClick={handleCheckout}
                disabled={checkingOut}
                className="flex-1 flex items-center justify-center gap-2 bg-[#00A3A8] text-white px-6 py-2.5 rounded-full text-sm font-semibold hover:bg-[#00B4B8] transition-colors disabled:opacity-50 cursor-pointer"
              >
                {checkingOut ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  <>Checkout <ArrowRight size={16} /></>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </section>
  );
}
