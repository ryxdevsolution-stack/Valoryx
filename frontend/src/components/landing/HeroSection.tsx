'use client'

import { motion } from 'framer-motion'
import { ArrowRight, Play, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import {
  siteConfig,
  trustItems,
  heroMockupStats,
  heroMockupBills,
  heroChartHeights,
} from '@/config/landing.config'
import { fadeInUp, staggerContainer } from '@/lib/landing/animations'
import MouseParticles from './effects/MouseParticles'
import { Floating3DCard, FloatingCards, GeometricShapes } from './effects/FloatingElements'
import { MeshGradientBackground } from './effects/GradientBackground'

export default function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden pt-20 lg:pt-0">
      {/* Dark Mode: Mesh Gradient Background */}
      <div className="hidden dark:block">
        <MeshGradientBackground />
      </div>

      {/* Light Mode: Gradient Background */}
      <div className="dark:hidden absolute inset-0 bg-gradient-to-br from-sky-50 via-white to-indigo-50" />

      {/* Interactive Particle System */}
      <div className="absolute inset-0 z-[1]">
        <MouseParticles
          count={60}
          colors={['#0ea5e9', '#8b5cf6', '#06b6d4', '#3b82f6', '#a855f7']}
          connectionDistance={120}
          particleSize={{ min: 2, max: 4 }}
        />
      </div>

      {/* Animated Geometric Shapes */}
      <GeometricShapes className="z-[2] opacity-60 dark:opacity-40" />

      {/* Floating Cards (Figma-style) */}
      <FloatingCards className="z-[2] hidden lg:block" />

      {/* Animated Gradient Orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-[3]">
        <motion.div
          className="absolute -top-1/4 -right-1/4 w-[500px] h-[500px] lg:w-[700px] lg:h-[700px] rounded-full bg-primary-200/30 dark:bg-primary-500/10 blur-3xl"
          animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute -bottom-1/4 -left-1/4 w-[400px] h-[400px] lg:w-[600px] lg:h-[600px] rounded-full bg-indigo-200/30 dark:bg-purple-500/10 blur-3xl"
          animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0.4, 0.3] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        />
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] lg:w-[500px] lg:h-[500px] rounded-full bg-purple-200/20 dark:bg-cyan-500/10 blur-3xl"
          animate={{ scale: [1, 1.2, 1], rotate: [0, 180, 360] }}
          transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
        />
      </div>

      {/* Subtle Pattern Overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.02] dark:opacity-[0.03] z-[4]"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }}
      />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center min-h-[calc(100vh-5rem)]">
          {/* Text Content */}
          <motion.div
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
            className="text-center lg:text-left"
          >
            {/* Badge */}
            <motion.div variants={fadeInUp}>
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-100/80 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-sm font-medium mb-6 backdrop-blur-sm border border-primary-200/50 dark:border-primary-700/30">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                </span>
                GST Compliant for Indian Businesses
              </span>
            </motion.div>

            {/* Headline */}
            <motion.h1
              variants={fadeInUp}
              className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold text-gray-900 dark:text-white leading-[1.1] mb-6"
            >
              {siteConfig.tagline.split(' ').slice(0, 2).join(' ')}{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-500 via-primary-600 to-indigo-600 dark:from-primary-400 dark:via-cyan-400 dark:to-purple-400">
                {siteConfig.tagline.split(' ').slice(2).join(' ')}
              </span>
            </motion.h1>

            {/* Subheadline */}
            <motion.p
              variants={fadeInUp}
              className="text-lg sm:text-xl text-gray-600 dark:text-gray-300 mb-8 max-w-xl mx-auto lg:mx-0 leading-relaxed"
            >
              {siteConfig.description}
            </motion.p>

            {/* CTA Buttons */}
            <motion.div
              variants={fadeInUp}
              className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start mb-8"
            >
              <Link
                href={siteConfig.routes.register}
                className="group relative inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white font-semibold shadow-lg shadow-primary-500/25 hover:shadow-xl hover:shadow-primary-500/30 transition-all duration-300 hover:scale-[1.02] overflow-hidden"
              >
                {/* Shimmer effect */}
                <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                Start Free Trial
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
              <button className="group inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-primary-500 dark:hover:border-primary-500 text-gray-700 dark:text-gray-300 font-semibold transition-all duration-300 hover:bg-primary-50 dark:hover:bg-primary-950/30 backdrop-blur-sm">
                <Play className="w-5 h-5 group-hover:scale-110 transition-transform" />
                Watch Demo
              </button>
            </motion.div>

            {/* Trust Indicators */}
            <motion.div
              variants={fadeInUp}
              className="flex flex-wrap items-center justify-center lg:justify-start gap-x-6 gap-y-2 text-sm text-gray-500 dark:text-gray-400"
            >
              {trustItems.slice(0, 3).map((item, index) => (
                <span key={index} className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  {item}
                </span>
              ))}
            </motion.div>
          </motion.div>

          {/* Mockup/Visual with 3D Effect */}
          <motion.div
            initial={{ opacity: 0, x: 100, rotateY: -10 }}
            animate={{ opacity: 1, x: 0, rotateY: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 80, delay: 0.5 }}
            className="relative"
          >
            <Floating3DCard intensity={8}>
              <DashboardMockup />
            </Floating3DCard>
          </motion.div>
        </div>
      </div>

      {/* Scroll Indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.5 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 hidden lg:block z-20"
      >
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="w-6 h-10 rounded-full border-2 border-gray-300 dark:border-gray-600 flex justify-center pt-2 backdrop-blur-sm"
        >
          <div className="w-1 h-2 rounded-full bg-gray-400 dark:bg-gray-500" />
        </motion.div>
      </motion.div>
    </section>
  )
}

// Extracted Dashboard Mockup Component
function DashboardMockup() {
  return (
    <div className="relative mx-auto max-w-lg lg:max-w-none">
      {/* Glow Effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-primary-500/20 via-purple-500/20 to-cyan-500/20 rounded-2xl blur-2xl transform scale-110" />

      {/* Main Mockup Card */}
      <div className="relative bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-200/50 dark:border-gray-700/50 overflow-hidden">
        {/* Browser Header */}
        <div className="flex items-center gap-2 px-4 py-3 bg-gray-100/80 dark:bg-gray-900/80 border-b border-gray-200/50 dark:border-gray-700/50">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-400" />
            <div className="w-3 h-3 rounded-full bg-yellow-400" />
            <div className="w-3 h-3 rounded-full bg-green-400" />
          </div>
          <div className="flex-1 flex justify-center">
            <div className="px-4 py-1 rounded-lg bg-white/50 dark:bg-gray-800/50 text-xs text-gray-500 dark:text-gray-400 font-mono border border-gray-200/30 dark:border-gray-600/30">
              {siteConfig.appUrl}
            </div>
          </div>
        </div>

        {/* Dashboard Preview */}
        <div className="p-4 sm:p-6 space-y-4">
          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-3">
            {heroMockupStats.map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 + i * 0.1 }}
                whileHover={{ scale: 1.02, y: -2 }}
                className="p-3 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100/50 dark:from-gray-700/50 dark:to-gray-800/50 border border-gray-200/30 dark:border-gray-600/30 cursor-pointer transition-shadow hover:shadow-md"
              >
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{stat.label}</p>
                <p className={`text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r ${stat.color}`}>
                  {stat.value}
                </p>
              </motion.div>
            ))}
          </div>

          {/* Chart Placeholder */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 1.1 }}
            className="h-32 sm:h-40 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100/50 dark:from-gray-700/50 dark:to-gray-800/50 border border-gray-200/30 dark:border-gray-600/30 flex items-end justify-around p-4"
          >
            {heroChartHeights.map((height, i) => (
              <motion.div
                key={i}
                initial={{ height: 0 }}
                animate={{ height: `${height}%` }}
                transition={{ delay: 1.3 + i * 0.05, type: 'spring', damping: 15 }}
                whileHover={{ scaleY: 1.05 }}
                className="w-6 sm:w-8 rounded-t-lg bg-gradient-to-t from-primary-500 to-primary-400 dark:from-primary-600 dark:to-cyan-400 cursor-pointer transition-all hover:shadow-lg hover:shadow-primary-500/30"
              />
            ))}
          </motion.div>

          {/* Recent Bills */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.5 }}
            className="space-y-2"
          >
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Recent Bills</p>
            {heroMockupBills.map((bill) => (
              <motion.div
                key={bill.id}
                whileHover={{ x: 4 }}
                className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50/80 dark:bg-gray-700/30 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
              >
                <div>
                  <span className="font-medium text-gray-900 dark:text-white">{bill.id}</span>
                  <span className="text-gray-500 dark:text-gray-400 ml-2">{bill.customer}</span>
                </div>
                <span className="font-semibold text-green-600 dark:text-green-400">{bill.amount}</span>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>

      {/* Floating Elements */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8, x: 20 }}
        animate={{ opacity: 1, scale: 1, x: 0 }}
        transition={{ delay: 1.8, type: 'spring' }}
        whileHover={{ scale: 1.05 }}
        className="absolute -top-4 -right-4 sm:-right-8 px-4 py-2 rounded-xl bg-white dark:bg-gray-800 shadow-xl border border-gray-200/50 dark:border-gray-700/50 cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">GST Filed</p>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Success</p>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.8, x: -20 }}
        animate={{ opacity: 1, scale: 1, x: 0 }}
        transition={{ delay: 2, type: 'spring' }}
        whileHover={{ scale: 1.05 }}
        className="absolute -bottom-4 -left-4 sm:-left-8 px-4 py-2 rounded-xl bg-white dark:bg-gray-800 shadow-xl border border-gray-200/50 dark:border-gray-700/50 cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
            <span className="text-lg">📦</span>
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Low Stock Alert</p>
            <p className="text-sm font-semibold text-orange-600 dark:text-orange-400">5 items</p>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
