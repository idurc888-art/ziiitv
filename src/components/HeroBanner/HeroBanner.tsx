import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { Channel } from '../../types/channel';
import { keyboardMaestro } from '../../services/keyboardManager';
import { avplayCardManager } from '../../services/avplayCardManager';
import './HeroBanner.css';

export interface HeroSlide {
  id: string;
  title: string;
  subtitle?: string;
  description: string;
  badge?: string;
  backgroundImage: string;
  videoUrl?: string;
  type: 'movie' | 'series' | 'live' | 'channel';
  tmdbId?: number;
  channel?: Channel;
  logoPath?: string; // Suporte futuro para logo transparente
}

interface HeroBannerProps {
  slides: HeroSlide[];
  autoPlayInterval?: number;
  onSelect?: (slide: HeroSlide) => void;
  onAddToList?: (slide: HeroSlide) => void;
  focused?: boolean;
  videoPlaying?: boolean;
  hideUI?: boolean;
}

export function HeroBanner({
  slides,
  autoPlayInterval = 7000,
  onSelect,
  onAddToList,
  focused = false,
  videoPlaying: externalVideoPlaying = false,
  hideUI = false,
}: HeroBannerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(autoPlayInterval > 0);
  const [heroVideoActive, setHeroVideoActive] = useState(false);

  const trackRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const autoPlayTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const videoTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastKeyPressRef = useRef<number>(0);

  const currentSlide = slides[currentIndex];

  const goToSlide = useCallback((newIndex: number) => {
    if (slides.length <= 1) return;
    let next = newIndex;
    if (next >= slides.length) next = 0;
    if (next < 0) next = slides.length - 1;
    setCurrentIndex(next);
    setHeroVideoActive(false);
    avplayCardManager.requestStop();
  }, [slides.length]);

  // Gerenciamento de Vídeo (AVPlay)
  useEffect(() => {
    if (videoTimerRef.current) clearTimeout(videoTimerRef.current);
    setHeroVideoActive(false);
    avplayCardManager.requestStop();

    if (!focused || !currentSlide?.channel?.activeStream?.url || externalVideoPlaying) return;

    videoTimerRef.current = setTimeout(() => {
      const rect = { x: 0, y: 0, w: window.innerWidth, h: 560 }; // Rect do Hero (ajustar se necessário)
      avplayCardManager.requestPlay(
        currentSlide.channel!.activeStream!.url,
        rect,
        {
          onPlaying: () => setHeroVideoActive(true),
          onError: () => setHeroVideoActive(false)
        }
      );
    }, 300);

    return () => {
      if (videoTimerRef.current) clearTimeout(videoTimerRef.current);
      avplayCardManager.requestStop();
    };
  }, [currentIndex, focused, currentSlide, externalVideoPlaying]);

  // Slide auto-rotation
  useEffect(() => {
    if (!isAutoPlaying || autoPlayInterval <= 0 || slides.length <= 1 || heroVideoActive) {
      clearTimeout(autoPlayTimerRef.current);
      if (progressRef.current && !heroVideoActive) progressRef.current.style.width = '0%';
      return;
    }
    clearTimeout(autoPlayTimerRef.current);
    if (progressRef.current) {
      progressRef.current.style.transition = 'none';
      progressRef.current.style.width = '0%';
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (progressRef.current) {
            progressRef.current.style.transition = `width ${autoPlayInterval}ms linear`;
            progressRef.current.style.width = '100%';
          }
        });
      });
    }
    autoPlayTimerRef.current = setTimeout(() => goToSlide(currentIndex + 1), autoPlayInterval);
    return () => clearTimeout(autoPlayTimerRef.current);
  }, [currentIndex, isAutoPlaying, autoPlayInterval, goToSlide, slides.length, heroVideoActive]);

  useEffect(() => {
    setIsAutoPlaying(autoPlayInterval > 0);
  }, [autoPlayInterval]);

  // D-pad
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const now = Date.now();
      if (now - lastKeyPressRef.current < 400) return;
      if (!focused || hideUI) return;
      switch (e.key) {
        case 'ArrowLeft':
          lastKeyPressRef.current = now;
          setIsAutoPlaying(false);
          goToSlide(currentIndex - 1);
          break;
        case 'ArrowRight':
          lastKeyPressRef.current = now;
          setIsAutoPlaying(false);
          goToSlide(currentIndex + 1);
          break;
        case 'Enter':
          lastKeyPressRef.current = now;
          if (onSelect && currentSlide) onSelect(currentSlide);
          break;
        case 'F1':
          lastKeyPressRef.current = now;
          if (onAddToList && currentSlide) onAddToList(currentSlide);
          break;
      }
    };
    keyboardMaestro.subscribe('main:hero', handleKeyDown);
    return () => keyboardMaestro.unsubscribe('main:hero');
  }, [currentIndex, currentSlide, goToSlide, onSelect, onAddToList, focused, hideUI]);

  if (slides.length === 0) {
    return <div className="hero-empty">Nenhum conteúdo disponível</div>;
  }

  const isAnyVideoPlaying = externalVideoPlaying || heroVideoActive;
  const viewportBg = isAnyVideoPlaying ? 'transparent' : undefined;
  const backdropOpacity = isAnyVideoPlaying ? 0 : 1;
  const uiOpacity = (externalVideoPlaying || hideUI) ? 0 : 1;

  return (
    <div
      className={`hero-viewport${focused ? ' hero-focused' : ''}`}
      style={viewportBg ? { background: viewportBg } : undefined}
    >
      <div ref={trackRef} className="hero-track-absolute">
        {slides.map((slide, index) => {
          const isActive = index === currentIndex;
          return (
            <div
              key={`${slide.id}-${index}`}
              className={`hero-slide-absolute ${isActive ? 'active' : ''}`}
              data-index={index}
            >
              <div
                className="hero-bg"
                style={{
                  backgroundImage: `url(${slide.backgroundImage})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  zIndex: 1,
                  opacity: isActive ? backdropOpacity : 0,
                  transition: 'opacity 500ms ease-in-out',
                }}
              />
              <div
                className="hero-overlay"
                style={{ zIndex: 2, opacity: isActive ? uiOpacity : 0, transition: 'opacity 300ms' }}
              />
              <div
                className="hero-content"
                style={{
                  zIndex: 3,
                  opacity: isActive ? uiOpacity : 0,
                  transition: 'opacity 300ms, transform 300ms',
                  transform: (isActive && uiOpacity !== 0) ? 'translateY(0)' : 'translateY(20px)',
                  display: isActive ? 'block' : 'none'
                }}
              >
                {slide.badge && <span className="hero-badge">{slide.badge}</span>}
                
                {slide.logoPath ? (
                  <img src={slide.logoPath} alt={slide.title} className="hero-logo-art" />
                ) : (
                  <h1 className="hero-title">{slide.title}</h1>
                )}
                
                {slide.subtitle && <h2 className="hero-subtitle">{slide.subtitle}</h2>}
                <p className="hero-description">{slide.description}</p>
                <div className="hero-actions">
                  <button
                    className="hero-btn hero-btn-primary"
                    onClick={() => onSelect?.(currentSlide)}
                  >
                    ▶ Assistir
                  </button>
                  <button
                    className="hero-btn hero-btn-secondary"
                    onClick={() => onAddToList?.(currentSlide)}
                  >
                    + Minha Lista
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div
        className="hero-progress-container"
        style={{ opacity: uiOpacity, transition: 'opacity 300ms' }}
      >
        <div ref={progressRef} className="hero-progress" style={{ width: '0%' }} />
      </div>

      <div
        className="hero-dots"
        style={{ opacity: uiOpacity, transition: 'opacity 300ms' }}
      >
        {slides.map((_, dotIndex) => (
          <button
            key={dotIndex}
            className={`hero-dot ${dotIndex === currentIndex ? 'active' : ''}`}
            onClick={() => {
              setIsAutoPlaying(false);
              goToSlide(dotIndex);
            }}
            aria-label={`Ir para slide ${dotIndex + 1}`}
          />
        ))}
      </div>

      <div
        className="hero-controls"
        style={{ opacity: uiOpacity, transition: 'opacity 300ms' }}
      >
        <button
          className="hero-control-btn"
          onClick={() => {
            setIsAutoPlaying(!isAutoPlaying);
            if (!isAutoPlaying) {
              setHeroVideoActive(false);
              avplayCardManager.requestStop();
            }
          }}
        >
          {isAutoPlaying ? '⏸️' : '▶️'}
        </button>
      </div>
    </div>
  );
}
