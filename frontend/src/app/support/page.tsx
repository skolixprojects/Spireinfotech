"use client";

import { motion } from "framer-motion";
import { Mail, MessageSquare, FileText, HelpCircle } from "lucide-react";

const supportOptions = [
  { icon: HelpCircle, title: "FAQ", description: "Find answers to commonly asked questions about courses, mentors, and payments.", href: "#faq" },
  { icon: MessageSquare, title: "Live Chat", description: "Chat with our support team in real-time. Available Mon-Fri, 9 AM - 6 PM IST.", href: "#chat" },
  { icon: Mail, title: "Email Support", description: "Send us an email at support@spire-learn.in and we'll respond within 24 hours.", href: "mailto:support@spire-learn.in" },
  { icon: FileText, title: "Documentation", description: "Browse our detailed guides and tutorials on using the Spire Info Tech platform.", href: "#docs" },
];

const faqs = [
  { q: "Do I get a certificate?", a: "Yes — complete all lessons, pass each quiz (60% or higher, with multiple attempts allowed), and submit the final assignment. Your certificate becomes available for download once all three are complete." },
  { q: "What payment methods are accepted?", a: "We accept UPI, Credit/Debit Cards, NetBanking, and popular wallets through Razorpay." },
];

export default function SupportPage() {
  return (
    <section className="pt-32 pb-20 px-6">
      <div className="mx-auto max-w-5xl">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="font-serif text-4xl font-bold text-gray-900 mb-4"
        >
          Support
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-gray-600 mb-12"
        >
          We&apos;re here to help. Choose how you&apos;d like to reach us.
        </motion.p>

        <div className="grid gap-6 sm:grid-cols-2 mb-20">
          {supportOptions.map((opt, i) => (
            <motion.a
              key={opt.title}
              href={opt.href}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 * i, ease: "easeOut" as const }}
              className="block rounded-2xl border border-gray-200 bg-white p-8 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5"
            >
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-teal-100 text-teal-700 mb-4">
                <opt.icon size={24} />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{opt.title}</h3>
              <p className="text-gray-600 text-sm">{opt.description}</p>
            </motion.a>
          ))}
        </div>

        <div id="faq">
          <h2 className="font-serif text-2xl font-bold text-gray-900 mb-8">Frequently Asked Questions</h2>
          <div className="space-y-4">
            {faqs.map((faq, i) => (
              <motion.details
                key={i}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * i }}
                className="group rounded-xl border border-gray-200 bg-white"
              >
                <summary className="cursor-pointer px-6 py-4 text-gray-900 font-medium flex items-center justify-between">
                  {faq.q}
                  <span className="text-gray-400 group-open:rotate-45 transition-transform text-xl">+</span>
                </summary>
                <p className="px-6 pb-4 text-gray-600 text-sm">{faq.a}</p>
              </motion.details>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
