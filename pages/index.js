import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';

export default function Home() {
  // State management
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [textInput, setTextInput] = useState('');
  const [conversation, setConversation] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [error, setError] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isChrome, setIsChrome] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  
  // Accessibility & Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [theme, setTheme] = useState('dark'); // 'light', 'dark', 'auto'
  const [selectedModel, setSelectedModel] = useState('gpt-4o');
  const [glassIntensity, setGlassIntensity] = useState(2); // 1-3 (subtle to strong)
  const [animationsEnabled, setAnimationsEnabled] = useState(true);
  const [fontSize, setFontSize] = useState('medium'); // 'small', 'medium', 'large'
  const [reduceMotion, setReduceMotion] = useState(false);

  // Refs
  const recognitionRef = useRef(null);
  const conversationEndRef = useRef(null);
  const conversationContainerRef = useRef(null);
  const utteranceRef = useRef(null);
  const settingsPanelRef = useRef(null);
  const maxRetries = 2;

  // Available AI Models
  const availableModels = [
    { id: 'gpt-4o', name: 'GPT-4o', description: 'Most capable, best for complex tasks' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Faster responses, great for quick tasks' },
    { id: 'gpt-4', name: 'GPT-4', description: 'Advanced reasoning and analysis' }
  ];

  // Load saved settings from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('voicebot-theme') || 'dark';
      const savedModel = localStorage.getItem('voicebot-model') || 'gpt-4o';
      const savedGlassIntensity = localStorage.getItem('voicebot-glass') || '2';
      const savedAnimations = localStorage.getItem('voicebot-animations') !== 'false';
      const savedFontSize = localStorage.getItem('voicebot-font-size') || 'medium';
      const savedReduceMotion = localStorage.getItem('voicebot-reduce-motion') === 'true';
      
      setTheme(savedTheme);
      setSelectedModel(savedModel);
      setGlassIntensity(parseInt(savedGlassIntensity));
      setAnimationsEnabled(savedAnimations);
      setFontSize(savedFontSize);
      setReduceMotion(savedReduceMotion);

      // Detect system preference for reduce motion
      if (window.matchMedia) {
        const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        if (mediaQuery.matches && !localStorage.getItem('voicebot-reduce-motion')) {
          setReduceMotion(true);
        }
      }
    }
  }, []);

  // Save settings to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('voicebot-theme', theme);
      localStorage.setItem('voicebot-model', selectedModel);
      localStorage.setItem('voicebot-glass', glassIntensity.toString());
      localStorage.setItem('voicebot-animations', animationsEnabled.toString());
      localStorage.setItem('voicebot-font-size', fontSize);
      localStorage.setItem('voicebot-reduce-motion', reduceMotion.toString());
    }
  }, [theme, selectedModel, glassIntensity, animationsEnabled, fontSize, reduceMotion]);

  // Load voices for better TTS quality
  useEffect(() => {
    if ('speechSynthesis' in window) {
      // Load voices
      const loadVoices = () => {
        speechSynthesis.getVoices();
      };
      
      // Chrome loads voices asynchronously
      if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = loadVoices;
      }
      
      // Load immediately for other browsers
      loadVoices();
    }
  }, []);

  // Detect Chrome browser
  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    const chrome = /chrome/.test(userAgent) && !/edge|edg/.test(userAgent);
    setIsChrome(chrome);
  }, []);

  // Handle scroll detection for scroll-to-bottom button
  useEffect(() => {
    const handleScroll = () => {
      if (conversationContainerRef.current) {
        const { scrollTop, scrollHeight, clientHeight } = conversationContainerRef.current;
        const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
        setShowScrollButton(!isNearBottom && conversation.length > 3);
      }
    };

    const container = conversationContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [conversation]);

  // Check for speech recognition support
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      setSpeechSupported(true);
      
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
        setError('');
      };

      recognition.onresult = (event) => {
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += transcript;
          } else {
            interim += transcript;
          }
        }

        setInterimTranscript(interim);
        if (final) {
          setTranscript(prev => prev + final);
        }
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        let errorMessage = '';
        
        switch(event.error) {
          case 'network':
            if (retryCount < maxRetries) {
              errorMessage = `Network issue detected. Retrying... (Attempt ${retryCount + 1}/${maxRetries})`;
              setError(errorMessage);
              // Auto-retry after a short delay
              setTimeout(() => {
                setRetryCount(prev => prev + 1);
                setError('');
                try {
                  recognitionRef.current?.start();
                } catch (e) {
                  console.error('Retry failed:', e);
                }
              }, 1000);
              return;
            } else {
              errorMessage = 'Speech recognition unavailable. Please use text input below or check your internet connection and try again later.';
              setRetryCount(0); // Reset retry count
            }
            break;
          case 'not-allowed':
          case 'permission-denied':
            errorMessage = 'Microphone access denied. Please enable microphone permissions in your browser settings and reload the page.';
            break;
          case 'no-speech':
            errorMessage = 'No speech detected. Please try speaking again.';
            setIsListening(false);
            return; // Don't stop completely, user can try again
          case 'aborted':
            // Don't show error for aborted, it's usually intentional
            setIsListening(false);
            return;
          case 'audio-capture':
            errorMessage = 'No microphone found. Please connect a microphone and try again.';
            break;
          default:
            errorMessage = `Speech recognition error: ${event.error}. Please use text input below.`;
        }
        
        setError(errorMessage);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
        // Reset retry count on successful end
        setRetryCount(0);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  // Auto-scroll to bottom of conversation
  useEffect(() => {
    // Use setTimeout to ensure DOM has updated before scrolling
    const scrollTimeout = setTimeout(() => {
      if (conversationEndRef.current) {
        conversationEndRef.current.scrollIntoView({ 
          behavior: 'smooth',
          block: 'end',
          inline: 'nearest'
        });
      }
    }, 100);

    return () => clearTimeout(scrollTimeout);
  }, [conversation]);

  // Start/stop voice recognition
  const toggleListening = () => {
    if (!speechSupported) {
      setError('Speech recognition not supported in this browser. Please use the text input below.');
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      setTranscript('');
      setInterimTranscript('');
      setError(''); // Clear any previous errors
      
      try {
        recognitionRef.current?.start();
      } catch (error) {
        console.error('Error starting speech recognition:', error);
        setError('Could not start speech recognition. Please use the text input below.');
      }
    }
  };

  // Send message to API
  const sendMessage = async (messageText) => {
    if (!messageText.trim()) return;

    setIsLoading(true);
    setError('');

    // Add user message to conversation
    const userMessage = { role: 'user', content: messageText.trim() };
    const newConversation = [...conversation, userMessage];
    setConversation(newConversation);

    // Scroll to show user message
    setTimeout(() => {
      conversationEndRef.current?.scrollIntoView({ 
        behavior: 'smooth',
        block: 'end',
        inline: 'nearest'
      });
    }, 50);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: messageText.trim(),
          history: conversation,
          model: selectedModel
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }

      // Add assistant response to conversation
      const assistantMessage = { role: 'assistant', content: data.reply };
      setConversation(prev => [...prev, assistantMessage]);

      // Immediately scroll to show the new response
      setTimeout(() => {
        conversationEndRef.current?.scrollIntoView({ 
          behavior: 'smooth',
          block: 'end',
          inline: 'nearest'
        });
      }, 150);

      // Speak the response using TTS with improved voice
      if ('speechSynthesis' in window && data.reply) {
        // Cancel any ongoing speech
        speechSynthesis.cancel();
        setIsSpeaking(true);
        
        const utterance = new SpeechSynthesisUtterance(data.reply);
        utteranceRef.current = utterance;
        
        // Get available voices and select a better one
        const voices = speechSynthesis.getVoices();
        
        // Try to find a high-quality English voice
        const preferredVoice = voices.find(voice => 
          // Prefer Google voices (usually highest quality and free)
          voice.name.includes('Google') && voice.lang.startsWith('en')
        ) || voices.find(voice => 
          // Or Microsoft voices as second choice
          voice.name.includes('Microsoft') && voice.lang.startsWith('en')
        ) || voices.find(voice => 
          // Or any English voice with "Enhanced" or "Premium" in name
          (voice.name.includes('Enhanced') || voice.name.includes('Premium')) && voice.lang.startsWith('en')
        ) || voices.find(voice => 
          // Or any natural-sounding female voice
          voice.lang.startsWith('en') && (voice.name.includes('Samantha') || voice.name.includes('Karen') || voice.name.includes('Victoria'))
        ) || voices.find(voice => 
          // Fallback to any English voice
          voice.lang.startsWith('en')
        );
        
        if (preferredVoice) {
          utterance.voice = preferredVoice;
        }
        
        // Optimize speech parameters for better quality
        utterance.rate = 0.95;  // Slightly slower for clarity
        utterance.pitch = 1.0;  // Natural pitch
        utterance.volume = 1.0; // Full volume
        
        // Handle speech end
        utterance.onend = () => {
          setIsSpeaking(false);
        };
        
        utterance.onerror = () => {
          setIsSpeaking(false);
        };
        
        speechSynthesis.speak(utterance);
      }

    } catch (error) {
      console.error('Error sending message:', error);
      setError('Failed to send message. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle voice input submission
  const handleVoiceSubmit = () => {
    if (transcript.trim()) {
      // Stop recording when send is clicked
      if (isListening) {
        recognitionRef.current?.stop();
      }
      sendMessage(transcript);
      setTranscript('');
      setInterimTranscript('');
    }
  };

  // Handle text input submission
  const handleTextSubmit = (e) => {
    e.preventDefault();
    if (textInput.trim()) {
      sendMessage(textInput);
      setTextInput('');
    }
  };

  // Stop AI speech
  const stopSpeaking = () => {
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };

  // Clear conversation
  const clearConversation = () => {
    setConversation([]);
    stopSpeaking();
    setError('');
  };

  // Scroll to bottom
  const scrollToBottom = () => {
    conversationEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Copy message to clipboard
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      // Could add a toast notification here
    });
  };

  // Handle keyboard shortcuts
  const handleKeyDown = (e) => {
    if (e.key === ' ' && e.ctrlKey) {
      e.preventDefault();
      toggleListening();
    }
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isListening, speechSupported]);

  // Close settings panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (settingsPanelRef.current && !settingsPanelRef.current.contains(event.target)) {
        setShowSettings(false);
      }
    };

    if (showSettings) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showSettings]);

  // Get computed theme (handle auto mode)
  const getComputedTheme = () => {
    if (theme === 'auto') {
      if (typeof window !== 'undefined' && window.matchMedia) {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      return 'dark';
    }
    return theme;
  };

  const activeTheme = getComputedTheme();

  // iOS-Style Theme Colors with Vivid Backgrounds
  const themeColors = {
    light: {
      // Vivid, colorful gradient background (Apple-style)
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 25%, #f093fb 50%, #4facfe 75%, #00f2fe 100%)',
      // Translucent glass layers
      cardBackground: 'rgba(255, 255, 255, 0.25)',
      headerBackground: 'rgba(255, 255, 255, 0.3)',
      text: '#1a1a2e',
      textSecondary: '#4a4a6a',
      border: 'rgba(255, 255, 255, 0.3)',
      messageUser: 'linear-gradient(135deg, rgba(102, 126, 234, 0.9) 0%, rgba(118, 75, 162, 0.9) 100%)',
      messageAssistant: 'rgba(255, 255, 255, 0.4)',
      inputBackground: 'rgba(255, 255, 255, 0.3)',
      buttonBackground: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      statusOnline: '#10b981',
    },
    dark: {
      // Deep, rich dark gradients with vibrant accents
      background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 25%, #24243e 50%, #0f0c29 75%, #1a1a2e 100%)',
      // Semi-transparent frosted glass
      cardBackground: 'rgba(15, 12, 41, 0.4)',
      headerBackground: 'rgba(15, 12, 41, 0.5)',
      text: '#ffffff',
      textSecondary: '#a0aec0',
      border: 'rgba(255, 255, 255, 0.1)',
      messageUser: 'linear-gradient(135deg, rgba(59, 130, 246, 0.85) 0%, rgba(139, 92, 246, 0.85) 100%)',
      messageAssistant: 'rgba(30, 27, 75, 0.6)',
      inputBackground: 'rgba(15, 12, 41, 0.4)',
      buttonBackground: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
      statusOnline: '#34d399',
    }
  };

  const currentThemeColors = themeColors[activeTheme];

  // Glass intensity values
  const glassBlur = {
    1: '8px',
    2: '10px',
    3: '20px'
  };

  const glassOpacity = {
    1: 0.85,
    2: 0.95,
    3: 0.98
  };

  // Font size values
  const fontSizes = {
    small: {
      base: '0.875rem',
      heading: '1.25rem',
      title: '2rem'
    },
    medium: {
      base: '1rem',
      heading: '1.5rem',
      title: '2.5rem'
    },
    large: {
      base: '1.125rem',
      heading: '1.75rem',
      title: '3rem'
    }
  };

  const currentFontSize = fontSizes[fontSize];

  return (
    <>
      <Head>
        <title>AI Voice Assistant - Jithendra Aluri</title>
        <meta name="description" content="Advanced AI-powered voice assistant with natural language processing and speech recognition" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🤖</text></svg>" />
      </Head>
      
      <div style={{
        ...styles.container,
        background: currentThemeColors.background,
        fontSize: currentFontSize.base
      }}>
        {/* Chrome Notice Banner - Only show if not Chrome */}
        {!isChrome && (
          <div style={styles.chromeBanner}>
            <span style={styles.chromeBannerIcon}>⚠️</span>
            <span>For the best voice experience, please use <strong>Google Chrome</strong> browser • <a href="https://www.google.com/chrome/" target="_blank" rel="noopener noreferrer" style={styles.chromeLink}>Download Chrome</a></span>
          </div>
        )}

        <header style={{
          ...styles.header,
          background: currentThemeColors.headerBackground,
          color: currentThemeColors.text
        }}>
          <div style={styles.headerGradient}></div>
          <div style={styles.headerContent}>
            <div style={styles.logoContainer}>
              <div style={styles.logo}>🤖</div>
              <div style={styles.statusIndicator}>
                <span style={{...styles.statusDot, ...(speechSupported ? styles.statusDotOnline : styles.statusDotOffline)}}></span>
                <span style={{...styles.statusText, color: currentThemeColors.textSecondary}}>{speechSupported ? 'Voice Ready' : 'Text Only'}</span>
              </div>
            </div>
            <button 
              onClick={() => setShowSettings(!showSettings)} 
              style={{
                ...styles.settingsButton,
                background: currentThemeColors.inputBackground,
                color: currentThemeColors.text
              }}
              title="Settings & Accessibility"
              aria-label="Open settings"
            >
              ⚙️
            </button>
            <h1 style={{
              ...styles.title, 
              fontSize: currentFontSize.title,
              background: activeTheme === 'dark' 
                ? 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)' 
                : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text'
            }}>AI Voice Assistant</h1>
            <p style={{...styles.subtitle, color: currentThemeColors.textSecondary}}>
              {speechSupported 
                ? "Powered by Advanced AI • Natural Voice Interaction"
                : "Voice not supported - Please use Google Chrome"
            }
            </p>
            {speechSupported && (
              <div style={styles.infoBanner}>
                <span style={styles.infoBannerIcon}>💡</span>
                <span><strong>Quick Tip:</strong> Press <kbd style={styles.kbd}>Ctrl</kbd> + <kbd style={styles.kbd}>Space</kbd> to toggle microphone instantly</span>
              </div>
            )}
          </div>
        </header>

        <main style={styles.main}>
        
        {/* Settings Panel */}
        {showSettings && (
          <div style={styles.settingsOverlay}>
            <div ref={settingsPanelRef} style={{
              ...styles.settingsPanel,
              background: currentThemeColors.cardBackground,
              ...(animationsEnabled && !reduceMotion ? styles.settingsPanelAnimated : {})
            }}>
              <div style={styles.settingsHeader}>
                <h2 style={styles.settingsTitle}>⚙️ Settings & Accessibility</h2>
                <button onClick={() => setShowSettings(false)} style={styles.settingsCloseButton}>✕</button>
              </div>
              
              <div style={{...styles.settingsContent, color: currentThemeColors.text}}>
                {/* Theme Selector */}
                <div style={styles.settingSection}>
                  <label style={styles.settingLabel}>
                    <span style={styles.settingIcon}>🎨</span>
                    Theme
                  </label>
                  <div style={styles.themeSelector}>
                    {['light', 'dark', 'auto'].map((t) => (
                      <button
                        key={t}
                        onClick={() => setTheme(t)}
                        style={{
                          ...styles.themeButton,
                          ...(theme === t ? styles.themeButtonActive : {})
                        }}
                      >
                        {t === 'light' && '☀️'}
                        {t === 'dark' && '🌙'}
                        {t === 'auto' && '🔄'}
                        <span style={styles.themeButtonText}>{t.charAt(0).toUpperCase() + t.slice(1)}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Model Selector */}
                <div style={styles.settingSection}>
                  <label style={styles.settingLabel}>
                    <span style={styles.settingIcon}>🤖</span>
                    AI Model
                  </label>
                  <div style={styles.modelSelector}>
                    {availableModels.map((model) => (
                      <button
                        key={model.id}
                        onClick={() => setSelectedModel(model.id)}
                        style={{
                          ...styles.modelButton,
                          ...(selectedModel === model.id ? styles.modelButtonActive : {})
                        }}
                      >
                        <div style={styles.modelButtonHeader}>
                          <span style={styles.modelButtonName}>{model.name}</span>
                          {selectedModel === model.id && <span style={styles.modelBadge}>✓</span>}
                        </div>
                        <span style={styles.modelButtonDesc}>{model.description}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Glass Intensity */}
                <div style={styles.settingSection}>
                  <label style={styles.settingLabel}>
                    <span style={styles.settingIcon}>💎</span>
                    Glass Effect Intensity
                  </label>
                  <div style={styles.sliderContainer}>
                    <input
                      type="range"
                      min="1"
                      max="3"
                      value={glassIntensity}
                      onChange={(e) => setGlassIntensity(parseInt(e.target.value))}
                      style={styles.slider}
                    />
                    <div style={styles.sliderLabels}>
                      <span>Subtle</span>
                      <span>Medium</span>
                      <span>Strong</span>
                    </div>
                  </div>
                </div>

                {/* Font Size */}
                <div style={styles.settingSection}>
                  <label style={styles.settingLabel}>
                    <span style={styles.settingIcon}>📝</span>
                    Font Size
                  </label>
                  <div style={styles.fontSizeSelector}>
                    {['small', 'medium', 'large'].map((size) => (
                      <button
                        key={size}
                        onClick={() => setFontSize(size)}
                        style={{
                          ...styles.fontSizeButton,
                          ...(fontSize === size ? styles.fontSizeButtonActive : {})
                        }}
                      >
                        {size.charAt(0).toUpperCase() + size.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Toggle Settings */}
                <div style={styles.settingSection}>
                  <label style={styles.settingLabel}>
                    <span style={styles.settingIcon}>✨</span>
                    Visual Effects
                  </label>
                  <div style={styles.toggleGroup}>
                    <label style={styles.toggleLabel}>
                      <input
                        type="checkbox"
                        checked={animationsEnabled}
                        onChange={(e) => setAnimationsEnabled(e.target.checked)}
                        style={styles.checkbox}
                      />
                      <span>Enable Animations</span>
                    </label>
                    <label style={styles.toggleLabel}>
                      <input
                        type="checkbox"
                        checked={reduceMotion}
                        onChange={(e) => setReduceMotion(e.target.checked)}
                        style={styles.checkbox}
                      />
                      <span>Reduce Motion (Accessibility)</span>
                    </label>
                  </div>
                </div>

                {/* Info */}
                <div style={styles.settingsInfo}>
                  <p style={styles.settingsInfoText}>
                    💡 Settings are automatically saved to your browser
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Conversation History */}
        <div style={styles.conversationWrapper}>
          <div style={{
            ...styles.conversationHeader,
            background: currentThemeColors.cardBackground,
            color: currentThemeColors.text
          }}>
            <div style={styles.conversationTitle}>
              <span style={styles.conversationIcon}>💬</span>
              <span>Conversation</span>
              {conversation.length > 0 && (
                <span style={styles.messageCount}>{conversation.length} messages</span>
              )}
            </div>
            {conversation.length > 0 && (
              <div style={styles.conversationActions}>
                {isSpeaking && (
                  <button onClick={stopSpeaking} style={{
                    ...styles.actionButton,
                    background: currentThemeColors.inputBackground,
                    color: currentThemeColors.text
                  }} title="Stop speaking">
                    🔇 Stop
                  </button>
                )}
                <button onClick={clearConversation} style={{
                  ...styles.actionButton,
                  background: currentThemeColors.inputBackground,
                  color: currentThemeColors.text
                }} title="Clear conversation">
                  🗑️ Clear
                </button>
              </div>
            )}
          </div>
          
          <div ref={conversationContainerRef} style={{
            ...styles.conversationContainer,
            backdropFilter: `blur(${glassBlur[glassIntensity]})`,
            background: activeTheme === 'dark' 
              ? `rgba(30, 41, 59, ${glassOpacity[glassIntensity] * 0.9})`
              : `rgba(255, 255, 255, ${glassOpacity[glassIntensity]})`
          }}>
            {conversation.length === 0 ? (
              <div style={{...styles.welcomeMessage, color: currentThemeColors.text}}>
                <div style={styles.welcomeIcon}>👋</div>
                <h2 style={styles.welcomeTitle}>Welcome! Let's Start a Conversation</h2>
                <p style={{...styles.welcomeText, color: currentThemeColors.textSecondary}}>I'm your AI assistant, powered by advanced language models. I can help you with questions, creative tasks, problem-solving, and much more!</p>
                <div style={styles.suggestionChips}>
                  <div style={{
                    ...styles.chip,
                    background: currentThemeColors.inputBackground,
                    color: currentThemeColors.text,
                    border: `1px solid ${currentThemeColors.border}`
                  }} onClick={() => setTextInput("Tell me about yourself")}>💡 Get started</div>
                  <div style={{
                    ...styles.chip,
                    background: currentThemeColors.inputBackground,
                    color: currentThemeColors.text,
                    border: `1px solid ${currentThemeColors.border}`
                  }} onClick={() => setTextInput("What can you help me with?")}>📚 Explore features</div>
                  <div style={{
                    ...styles.chip,
                    background: currentThemeColors.inputBackground,
                    color: currentThemeColors.text,
                    border: `1px solid ${currentThemeColors.border}`
                  }} onClick={() => setTextInput("Tell me an interesting fact")}>🎯 Learn something</div>
                  <div style={{
                    ...styles.chip,
                    background: currentThemeColors.inputBackground,
                    color: currentThemeColors.text,
                    border: `1px solid ${currentThemeColors.border}`
                  }} onClick={() => setTextInput("Let's have a conversation")}>💬 Just chat</div>
                </div>
              </div>
            ) : (
              conversation.map((message, index) => (
                <div
                  key={index}
                  style={{
                    ...styles.messageWrapper,
                    ...(message.role === 'user' ? styles.userMessageWrapper : styles.assistantMessageWrapper)
                  }}
                >
                  <div style={message.role === 'user' ? styles.userAvatar : styles.assistantAvatar}>
                    {message.role === 'user' ? '👤' : '🤖'}
                  </div>
                  <div
                    style={{
                      ...styles.message,
                      ...(message.role === 'user' ? {
                        ...styles.userMessage,
                        background: currentThemeColors.messageUser,
                        color: '#fff'
                      } : {
                        ...styles.assistantMessage,
                        background: currentThemeColors.messageAssistant,
                        color: currentThemeColors.text,
                        border: `1px solid ${currentThemeColors.border}`
                      })
                    }}
                  >
                    <div style={styles.messageHeader}>
                      <strong style={styles.messageRole}>
                        {message.role === 'user' ? 'You' : 'AI Assistant'}
                      </strong>
                      {message.role === 'assistant' && (
                        <button 
                          onClick={() => copyToClipboard(message.content)} 
                          style={styles.copyButton}
                          title="Copy to clipboard"
                        >
                          📋
                        </button>
                      )}
                    </div>
                    <p style={styles.messageContent}>{message.content}</p>
                    {message.role === 'assistant' && index === conversation.length - 1 && (
                      <div style={styles.messageTimestamp}>
                        <span style={styles.timestampText}>Just now</span>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            {isLoading && (
              <div style={styles.messageWrapper}>
                <div style={styles.assistantAvatar}>🤖</div>
                <div style={{
                  ...styles.message,
                  background: currentThemeColors.messageAssistant,
                  color: currentThemeColors.text,
                  border: `1px solid ${currentThemeColors.border}`
                }}>
                  <div style={styles.messageHeader}>
                    <strong style={styles.messageRole}>AI Assistant</strong>
                  </div>
                  <div style={styles.typingIndicator}>
                    <span style={styles.dot}></span>
                    <span style={{...styles.dot, animationDelay: '0.2s'}}></span>
                    <span style={{...styles.dot, animationDelay: '0.4s'}}></span>
                    <span style={{...styles.typingText, color: currentThemeColors.textSecondary}}>Thinking...</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={conversationEndRef} />
          </div>
          
          {/* Scroll to bottom button */}
          {showScrollButton && (
            <button onClick={scrollToBottom} style={{
              ...styles.scrollButton,
              background: currentThemeColors.buttonBackground
            }} title="Scroll to bottom">
              ⬇️
            </button>
          )}
        </div>        {/* Voice Input Section */}
        {speechSupported && (
          <div style={styles.voiceSection}>
            <div style={{
              ...styles.voiceInputCard,
              background: currentThemeColors.cardBackground,
              borderColor: currentThemeColors.border
            }}>
              <div style={{...styles.voiceHeader, color: currentThemeColors.text}}>
                <span style={styles.voiceHeaderIcon}>🎤</span>
                <span style={styles.voiceHeaderText}>Voice Input</span>
                {isListening && <span style={styles.listeningBadge}>● Listening...</span>}
              </div>
              <div style={styles.voiceInputContent}>
                <button
                  onClick={toggleListening}
                  disabled={isLoading}
                  style={{
                    ...styles.micButton,
                    ...(isListening ? styles.micButtonActive : {}),
                    ...(isLoading ? styles.micButtonDisabled : {})
                  }}
                  aria-label={isListening ? "Stop recording" : "Start recording"}
                >
                  <span style={styles.micIcon}>{isListening ? '⏹' : '🎤'}</span>
                </button>
                
                {/* Editable Transcript Display */}
                <div style={styles.transcriptContainer}>
                  <textarea
                    value={transcript + interimTranscript}
                    onChange={(e) => setTranscript(e.target.value)}
                    placeholder={isListening ? "🎙️ Listening to your voice..." : "Click the mic button to start speaking, or type your message here..."}
                    disabled={isLoading}
                    style={{
                      ...styles.transcriptTextarea,
                      background: currentThemeColors.inputBackground,
                      color: currentThemeColors.text,
                      borderColor: currentThemeColors.border,
                      ...(isListening ? styles.transcriptTextareaActive : {})
                    }}
                    rows={3}
                    aria-label="Voice transcript (editable)"
                  />
                  {transcript && (
                    <button
                      onClick={handleVoiceSubmit}
                      disabled={isLoading}
                      style={{
                        ...styles.sendButton,
                        ...styles.voiceSendButton,
                        background: currentThemeColors.buttonBackground
                      }}
                      aria-label="Send voice message"
                    >
                      <span style={styles.sendButtonIcon}>✈️</span>
                      <span>Send</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Text Input Fallback */}
        <div style={{
          ...styles.textInputCard,
          background: currentThemeColors.cardBackground,
          borderColor: currentThemeColors.border
        }}>
          <div style={{...styles.textInputHeader, color: currentThemeColors.text}}>
            <span style={styles.textInputIcon}>⌨️</span>
            <span style={styles.textInputHeaderText}>Type Your Message</span>
          </div>
          <form onSubmit={handleTextSubmit} style={styles.textInputForm}>
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Type your message here and press Enter or click Send..."
              disabled={isLoading}
              style={{
                ...styles.textInput,
                background: currentThemeColors.inputBackground,
                color: currentThemeColors.text,
                borderColor: currentThemeColors.border
              }}
              aria-label="Type your message"
            />
            <button
              type="submit"
              disabled={isLoading || !textInput.trim()}
              style={{
                ...styles.sendButton,
                ...styles.textSendButton,
                background: currentThemeColors.buttonBackground,
                ...(isLoading || !textInput.trim() ? styles.sendButtonDisabled : {})
              }}
              aria-label="Send text message"
            >
              <span style={styles.sendButtonIcon}>✈️</span>
              <span>Send</span>
            </button>
          </form>
        </div>

        {/* Error Display */}
        {error && (
          <div style={{...styles.errorCard, background: currentThemeColors.cardBackground}} role="alert">
            <div style={styles.errorContent}>
              <span style={styles.errorIcon}>⚠️</span>
              <span style={{...styles.errorText, color: currentThemeColors.text}}>{error}</span>
            </div>
            <button 
              onClick={() => setError('')}
              style={styles.errorCloseButton}
              aria-label="Dismiss error"
            >
              ✕
            </button>
          </div>
        )}

        {/* Footer */}
        <footer style={{
          ...styles.footer,
          background: currentThemeColors.headerBackground,
          color: currentThemeColors.textSecondary
        }}>
          <p style={styles.footerText}>
            🚀 Powered by Advanced AI Models • 🎨 Crafted with Excellence • 💼 Portfolio Project by Jithendra Aluri
          </p>
          <p style={styles.footerSubtext}>
            Best viewed in Google Chrome • Built with Next.js & React
          </p>
        </footer>
      </main>

      {/* Add CSS animations */}
      <style jsx>{`
          /* Respect user's reduce motion preference */
          ${reduceMotion ? `
            * {
              animation-duration: 0.01ms !important;
              animation-iteration-count: 1 !important;
              transition-duration: 0.01ms !important;
            }
          ` : ''}
          
          ${!animationsEnabled ? `
            * {
              animation: none !important;
            }
          ` : ''}
          @keyframes pulse {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.05); opacity: 0.9; }
          }
          
          @keyframes bounce {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-8px); }
          }
          
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
          
          @keyframes slideInUp {
            from { opacity: 0; transform: translateY(30px); }
            to { opacity: 1; transform: translateY(0); }
          }
          
          @keyframes gradient {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
          }
          
          @keyframes ripple {
            0% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.7), 0 0 0 0 rgba(99, 102, 241, 0.7); }
            50% { box-shadow: 0 0 0 15px rgba(99, 102, 241, 0), 0 0 0 30px rgba(99, 102, 241, 0); }
            100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0), 0 0 0 0 rgba(99, 102, 241, 0); }
          }
          
          @keyframes shimmer {
            0% { background-position: -1000px 0; }
            100% { background-position: 1000px 0; }
          }
          
          /* Apple-inspired spring animations */
          @keyframes springIn {
            0% { 
              opacity: 0;
              transform: scale(0.8) translateY(40px);
            }
            50% {
              transform: scale(1.05) translateY(-10px);
            }
            100% { 
              opacity: 1;
              transform: scale(1) translateY(0);
            }
          }
          
          @keyframes smoothScale {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.02); }
          }
          
          @keyframes glassShimmer {
            0% { 
              background-position: -200% center;
            }
            100% { 
              background-position: 200% center;
            }
          }
          
          /* Hover effects with spring-like physics */
          button:hover {
            transform: translateY(-2px);
            transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
          }
          
          button:active {
            transform: translateY(0) scale(0.98);
            transition: all 0.1s ease;
          }
          
          /* Scrollbar styling */
          ::-webkit-scrollbar {
            width: 8px;
            height: 8px;
          }
          
          ::-webkit-scrollbar-track {
            background: #f1f5f9;
            border-radius: 10px;
          }
          
          ::-webkit-scrollbar-thumb {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 10px;
          }
          
          ::-webkit-scrollbar-thumb:hover {
            background: linear-gradient(135deg, #764ba2 0%, #667eea 100%);
          }
        `}</style>
      </div>
    </>
  );
}

// iOS-Style Glassmorphism Styles
const styles = {
  container: {
    minHeight: '100vh',
    position: 'relative',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    // Vivid animated background
    backgroundSize: '400% 400%',
    animation: 'gradient 15s ease infinite',
    position: 'relative',
    overflow: 'hidden',
  },
  chromeBanner: {
    background: 'linear-gradient(90deg, #ff6b6b 0%, #ee5a6f 100%)',
    color: '#fff',
    padding: '0.75rem 1.5rem',
    textAlign: 'center',
    fontSize: '0.9rem',
    fontWeight: '500',
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    position: 'sticky',
    top: 0,
    zIndex: 1000,
  },
  chromeBannerIcon: {
    fontSize: '1.2rem',
  },
  header: {
    // Translucent header with frosted effect
    background: 'rgba(255, 255, 255, 0.15)',
    backdropFilter: 'blur(40px) saturate(180%)',
    WebkitBackdropFilter: 'blur(40px) saturate(180%)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
    padding: '2rem 1.5rem',
    textAlign: 'center',
    position: 'relative',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)',
  },
  headerGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '4px',
    background: 'linear-gradient(90deg, #667eea, #764ba2, #f093fb, #667eea)',
    backgroundSize: '200% 200%',
    animation: 'gradient 3s ease infinite',
  },
  headerContent: {
    position: 'relative',
    zIndex: 1,
  },
  logoContainer: {
    marginBottom: '1rem',
  },
  logo: {
    fontSize: '3.5rem',
    display: 'inline-block',
    animation: 'bounce 2s ease-in-out infinite',
    filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.1))',
  },
  title: {
    margin: 0,
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
    fontSize: '2.5rem',
    fontWeight: '800',
    letterSpacing: '-0.5px',
  },
  subtitle: {
    margin: '0.75rem 0 0 0',
    color: '#64748b',
    fontSize: '1.1rem',
    fontWeight: '500',
  },
  infoBanner: {
    margin: '1.25rem auto 0',
    padding: '0.875rem 1.5rem',
    background: 'linear-gradient(135deg, #e0f2fe 0%, #dbeafe 100%)',
    border: '2px solid #bfdbfe',
    color: '#1e40af',
    borderRadius: '12px',
    fontSize: '0.95rem',
    maxWidth: '600px',
    textAlign: 'left',
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    boxShadow: '0 2px 8px rgba(59, 130, 246, 0.1)',
  },
  infoBannerIcon: {
    fontSize: '1.3rem',
  },
  kbd: {
    background: '#fff',
    border: '1px solid #cbd5e1',
    borderRadius: '4px',
    padding: '0.2rem 0.5rem',
    fontSize: '0.85rem',
    fontFamily: 'monospace',
    boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
    fontWeight: '600',
  },
  settingsButton: {
    position: 'absolute',
    top: '1.5rem',
    right: '1.5rem',
    // Glass button with depth
    background: 'rgba(255, 255, 255, 0.3)',
    backdropFilter: 'blur(20px) saturate(180%)',
    WebkitBackdropFilter: 'blur(20px) saturate(180%)',
    border: '1px solid rgba(255, 255, 255, 0.4)',
    borderRadius: '50%',
    width: '48px',
    height: '48px',
    fontSize: '1.5rem',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.5)',
    transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  settingsOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.5)',
    backdropFilter: 'blur(4px)',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1rem',
  },
  settingsPanel: {
    // Premium glass settings panel
    background: 'rgba(255, 255, 255, 0.25)',
    backdropFilter: 'blur(60px) saturate(200%)',
    WebkitBackdropFilter: 'blur(60px) saturate(200%)',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    borderRadius: '28px',
    maxWidth: '600px',
    width: '100%',
    maxHeight: '90vh',
    overflow: 'hidden',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.6)',
    display: 'flex',
    flexDirection: 'column',
  },
  settingsPanelAnimated: {
    animation: 'slideInUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
  settingsHeader: {
    padding: '1.5rem 2rem',
    borderBottom: '1px solid rgba(0, 0, 0, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: '#fff',
  },
  settingsTitle: {
    margin: 0,
    fontSize: '1.5rem',
    fontWeight: '700',
  },
  settingsCloseButton: {
    background: 'rgba(255, 255, 255, 0.2)',
    border: 'none',
    color: '#fff',
    fontSize: '1.5rem',
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
  },
  settingsContent: {
    padding: '2rem',
    overflowY: 'auto',
    flex: 1,
    background: 'transparent',
  },
  settingSection: {
    marginBottom: '2rem',
  },
  settingLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '1rem',
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: '1rem',
  },
  settingIcon: {
    fontSize: '1.3rem',
  },
  themeSelector: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '0.75rem',
  },
  themeButton: {
    padding: '1rem',
    background: 'rgba(255, 255, 255, 0.8)',
    border: '2px solid #e2e8f0',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '1.5rem',
  },
  themeButtonActive: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    border: '2px solid #667eea',
    color: '#fff',
    transform: 'scale(1.05)',
  },
  themeButtonText: {
    fontSize: '0.875rem',
    fontWeight: '500',
  },
  modelSelector: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  modelButton: {
    padding: '1rem 1.25rem',
    background: 'rgba(255, 255, 255, 0.8)',
    border: '2px solid #e2e8f0',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    textAlign: 'left',
  },
  modelButtonActive: {
    background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%)',
    border: '2px solid #667eea',
    transform: 'translateX(4px)',
  },
  modelButtonHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '0.25rem',
  },
  modelButtonName: {
    fontSize: '1rem',
    fontWeight: '600',
    color: '#1e293b',
  },
  modelBadge: {
    background: '#10b981',
    color: '#fff',
    padding: '0.15rem 0.5rem',
    borderRadius: '12px',
    fontSize: '0.75rem',
    fontWeight: '600',
  },
  modelButtonDesc: {
    fontSize: '0.875rem',
    color: '#64748b',
  },
  sliderContainer: {
    padding: '0.5rem 0',
  },
  slider: {
    width: '100%',
    height: '8px',
    borderRadius: '4px',
    background: 'linear-gradient(90deg, #e2e8f0 0%, #cbd5e1 100%)',
    outline: 'none',
    WebkitAppearance: 'none',
  },
  sliderLabels: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: '0.5rem',
    fontSize: '0.75rem',
    color: '#64748b',
    fontWeight: '500',
  },
  fontSizeSelector: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '0.75rem',
  },
  fontSizeButton: {
    padding: '0.75rem 1rem',
    background: 'rgba(255, 255, 255, 0.8)',
    border: '2px solid #e2e8f0',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    fontSize: '0.875rem',
    fontWeight: '500',
    color: '#1e293b',
  },
  fontSizeButtonActive: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    border: '2px solid #667eea',
    color: '#fff',
  },
  toggleGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  toggleLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.75rem 1rem',
    background: 'rgba(255, 255, 255, 0.8)',
    border: '1px solid #e2e8f0',
    borderRadius: '12px',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: '500',
    color: '#1e293b',
    transition: 'all 0.2s ease',
  },
  checkbox: {
    width: '20px',
    height: '20px',
    cursor: 'pointer',
    accentColor: '#667eea',
  },
  settingsInfo: {
    marginTop: '1.5rem',
    padding: '1rem',
    background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
    border: '1px solid #fbbf24',
    borderRadius: '12px',
  },
  settingsInfoText: {
    margin: 0,
    fontSize: '0.875rem',
    color: '#92400e',
    fontWeight: '500',
  },
  main: {
    maxWidth: '900px',
    margin: '0 auto',
    padding: '2rem 1.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
    minHeight: 'calc(100vh - 300px)',
  },
  conversationContainer: {
    // iOS-style frosted glass effect
    background: 'rgba(255, 255, 255, 0.2)',
    backdropFilter: 'blur(40px) saturate(180%)',
    WebkitBackdropFilter: 'blur(40px) saturate(180%)',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    borderRadius: '24px',
    padding: '2rem',
    minHeight: '400px',
    maxHeight: '500px',
    overflowY: 'auto',
    // Subtle shadow with inner glow
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.5)',
    animation: 'springIn 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
  welcomeMessage: {
    textAlign: 'center',
    padding: '3rem 2rem',
    color: '#334155',
  },
  welcomeIcon: {
    fontSize: '4rem',
    marginBottom: '1.5rem',
    animation: 'bounce 2s ease-in-out infinite',
  },
  welcomeTitle: {
    fontSize: '2rem',
    fontWeight: '700',
    margin: '0 0 1rem 0',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  },
  welcomeText: {
    fontSize: '1.1rem',
    color: '#64748b',
    lineHeight: '1.7',
    marginBottom: '2rem',
  },
  suggestionChips: {
    display: 'flex',
    gap: '0.75rem',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  chip: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: '#fff',
    padding: '0.5rem 1rem',
    borderRadius: '20px',
    fontSize: '0.9rem',
    fontWeight: '500',
    boxShadow: '0 2px 8px rgba(102, 126, 234, 0.3)',
    cursor: 'pointer',
    transition: 'transform 0.2s, box-shadow 0.2s',
  },
  messageWrapper: {
    display: 'flex',
    gap: '1rem',
    marginBottom: '1.5rem',
    animation: 'fadeIn 0.3s ease-out',
  },
  userMessageWrapper: {
    justifyContent: 'flex-end',
  },
  assistantMessageWrapper: {
    justifyContent: 'flex-start',
  },
  userAvatar: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.3rem',
    flexShrink: 0,
    boxShadow: '0 2px 8px rgba(102, 126, 234, 0.3)',
  },
  assistantAvatar: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.3rem',
    flexShrink: 0,
    boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
  },
  message: {
    maxWidth: '70%',
    padding: '1rem 1.25rem',
    borderRadius: '16px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
  },
  userMessage: {
    background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.9) 0%, rgba(118, 75, 162, 0.9) 100%)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    color: '#fff',
    borderBottomRightRadius: '4px',
    border: '1px solid rgba(255, 255, 255, 0.2)',
  },
  assistantMessage: {
    background: 'rgba(255, 255, 255, 0.3)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    color: '#1e293b',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    borderBottomLeftRadius: '4px',
  },
  messageHeader: {
    marginBottom: '0.5rem',
  },
  messageRole: {
    fontSize: '0.85rem',
    opacity: 0.9,
    fontWeight: '600',
  },
  messageContent: {
    margin: 0,
    lineHeight: '1.6',
    fontSize: '1rem',
    whiteSpace: 'pre-wrap',
    wordWrap: 'break-word',
  },
  typingIndicator: {
    display: 'flex',
    gap: '0.5rem',
    padding: '0.5rem 0',
  },
  dot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#94a3b8',
    animation: 'bounce 1.4s ease-in-out infinite',
  },
  voiceSection: {
    animation: 'fadeIn 0.5s ease-out',
  },
  voiceInputCard: {
    // Premium glass interface
    background: 'rgba(255, 255, 255, 0.2)',
    backdropFilter: 'blur(40px) saturate(180%)',
    WebkitBackdropFilter: 'blur(40px) saturate(180%)',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    borderRadius: '24px',
    padding: '1.5rem',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.5)',
  },
  voiceHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginBottom: '1.25rem',
    paddingBottom: '1rem',
    borderBottom: '2px solid #f1f5f9',
  },
  voiceHeaderIcon: {
    fontSize: '1.5rem',
  },
  voiceHeaderText: {
    fontSize: '1.1rem',
    fontWeight: '700',
    color: '#334155',
    flex: 1,
  },
  listeningBadge: {
    background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
    color: '#fff',
    padding: '0.4rem 0.9rem',
    borderRadius: '20px',
    fontSize: '0.85rem',
    fontWeight: '600',
    animation: 'pulse 2s ease-in-out infinite',
  },
  voiceInputContent: {
    display: 'flex',
    gap: '1.25rem',
    alignItems: 'flex-start',
  },
  micButton: {
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    border: 'none',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: '#fff',
    fontSize: '2rem',
    cursor: 'pointer',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    boxShadow: '0 8px 20px rgba(102, 126, 234, 0.4)',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  micButtonActive: {
    background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
    boxShadow: '0 8px 20px rgba(239, 68, 68, 0.4)',
    animation: 'ripple 2s ease-in-out infinite',
  },
  micButtonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  micIcon: {
    fontSize: '2rem',
    display: 'block',
  },
  transcriptContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  transcriptTextarea: {
    flex: 1,
    minHeight: '80px',
    padding: '1rem',
    // Glass input field
    background: 'rgba(255, 255, 255, 0.3)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    borderRadius: '16px',
    fontSize: '1rem',
    lineHeight: '1.6',
    fontFamily: 'inherit',
    resize: 'vertical',
    transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
    outline: 'none',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.5)',
  },
  transcriptTextareaActive: {
    border: '1px solid rgba(102, 126, 234, 0.5)',
    background: 'rgba(255, 255, 255, 0.4)',
    boxShadow: '0 4px 16px rgba(102, 126, 234, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.6)',
    transform: 'scale(1.01)',
  },
  textInputCard: {
    // Translucent layered glass card
    background: 'rgba(255, 255, 255, 0.2)',
    backdropFilter: 'blur(40px) saturate(180%)',
    WebkitBackdropFilter: 'blur(40px) saturate(180%)',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    borderRadius: '24px',
    padding: '1.5rem',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.5)',
    animation: 'springIn 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s backwards',
  },
  textInputHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginBottom: '1rem',
  },
  textInputIcon: {
    fontSize: '1.5rem',
  },
  textInputHeaderText: {
    fontSize: '1.1rem',
    fontWeight: '700',
    color: '#334155',
  },
  textInputForm: {
    display: 'flex',
    gap: '0.75rem',
    alignItems: 'center',
  },
  textInput: {
    flex: 1,
    padding: '1rem 1.25rem',
    // Glass input with frosted effect
    background: 'rgba(255, 255, 255, 0.3)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    borderRadius: '16px',
    fontSize: '1rem',
    transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
    outline: 'none',
    fontFamily: 'inherit',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.5)',
  },
  sendButton: {
    padding: '1rem 2rem',
    border: 'none',
    borderRadius: '12px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: '#fff',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    whiteSpace: 'nowrap',
  },
  sendButtonIcon: {
    fontSize: '1.2rem',
  },
  sendButtonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  voiceSendButton: {
    alignSelf: 'flex-start',
  },
  textSendButton: {
    flexShrink: 0,
  },
  errorCard: {
    background: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
    border: '2px solid #fca5a5',
    borderRadius: '12px',
    padding: '1rem 1.25rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1rem',
    animation: 'fadeIn 0.3s ease-out',
    boxShadow: '0 4px 12px rgba(239, 68, 68, 0.2)',
  },
  errorContent: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    flex: 1,
  },
  errorIcon: {
    fontSize: '1.5rem',
  },
  errorText: {
    color: '#991b1b',
    fontSize: '0.95rem',
    fontWeight: '500',
  },
  errorCloseButton: {
    background: 'transparent',
    border: 'none',
    color: '#991b1b',
    fontSize: '1.5rem',
    cursor: 'pointer',
    padding: '0.25rem 0.5rem',
    borderRadius: '6px',
    transition: 'background 0.2s',
    fontWeight: 'bold',
  },
  footer: {
    background: 'rgba(255, 255, 255, 0.1)',
    backdropFilter: 'blur(10px)',
    padding: '2rem 1.5rem',
    textAlign: 'center',
    borderTop: '1px solid rgba(255, 255, 255, 0.2)',
    marginTop: 'auto',
  },
  footerText: {
    color: '#fff',
    fontSize: '0.95rem',
    margin: '0 0 0.5rem 0',
    fontWeight: '600',
  },
  footerSubtext: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: '0.85rem',
    margin: 0,
    fontWeight: '400',
  },
  chromeLink: {
    color: '#fff',
    textDecoration: 'underline',
    fontWeight: '700',
  },
  statusIndicator: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    marginTop: '0.5rem',
    fontSize: '0.85rem',
  },
  statusDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    animation: 'pulse 2s ease-in-out infinite',
  },
  statusDotOnline: {
    background: '#10b981',
    boxShadow: '0 0 0 3px rgba(16, 185, 129, 0.3)',
  },
  statusDotOffline: {
    background: '#ef4444',
    boxShadow: '0 0 0 3px rgba(239, 68, 68, 0.3)',
  },
  statusText: {
    color: '#64748b',
    fontWeight: '600',
  },
  conversationWrapper: {
    position: 'relative',
    animation: 'fadeIn 0.5s ease-out',
  },
  conversationHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '1rem 1.5rem',
    background: 'rgba(255, 255, 255, 0.95)',
    backdropFilter: 'blur(10px)',
    borderRadius: '20px 20px 0 0',
    borderBottom: '2px solid #f1f5f9',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
  },
  conversationTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    fontSize: '1.1rem',
    fontWeight: '700',
    color: '#1e293b',
  },
  conversationIcon: {
    fontSize: '1.5rem',
  },
  messageCount: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: '#fff',
    padding: '0.25rem 0.75rem',
    borderRadius: '12px',
    fontSize: '0.8rem',
    fontWeight: '600',
  },
  conversationActions: {
    display: 'flex',
    gap: '0.5rem',
  },
  actionButton: {
    background: 'transparent',
    border: '2px solid #e2e8f0',
    borderRadius: '8px',
    padding: '0.5rem 1rem',
    fontSize: '0.9rem',
    fontWeight: '600',
    color: '#64748b',
    cursor: 'pointer',
    transition: 'all 0.3s',
  },
  conversationContainer: {
    background: 'rgba(255, 255, 255, 0.95)',
    backdropFilter: 'blur(10px)',
    borderRadius: '0 0 20px 20px',
    padding: '2rem',
    minHeight: '400px',
    maxHeight: '500px',
    overflowY: 'auto',
    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.1)',
  },
  scrollButton: {
    position: 'absolute',
    bottom: '20px',
    right: '20px',
    width: '50px',
    height: '50px',
    borderRadius: '50%',
    border: 'none',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: '#fff',
    fontSize: '1.5rem',
    cursor: 'pointer',
    boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)',
    transition: 'all 0.3s',
    zIndex: 10,
    animation: 'fadeIn 0.3s ease-out',
  },
  copyButton: {
    background: 'transparent',
    border: 'none',
    fontSize: '1rem',
    cursor: 'pointer',
    padding: '0.25rem 0.5rem',
    borderRadius: '4px',
    transition: 'background 0.2s',
    opacity: 0.7,
  },
  messageTimestamp: {
    marginTop: '0.5rem',
    paddingTop: '0.5rem',
    borderTop: '1px solid rgba(0, 0, 0, 0.05)',
  },
  timestampText: {
    fontSize: '0.75rem',
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  typingText: {
    marginLeft: '0.5rem',
    color: '#94a3b8',
    fontSize: '0.9rem',
    fontStyle: 'italic',
  },
};