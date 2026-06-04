import re

with open('/home/adham-ashraf/Documents/GitHub/EraMatch/Frontend/candidate-portal/src/components/RecordedInterviewFlow.tsx', 'r') as f:
    content = f.read()

# Replace the steps definition
content = re.sub(r'const steps = \[.*?\];', '', content, flags=re.DOTALL)

# Replace renderSetupStep
setup_pattern = r'const renderSetupStep = \(\) => \{.*?\n  \};\n\n  return \('
new_render = """
  const renderSetupStep = () => {
    return (
      <main className="max-w-4xl mx-auto py-12 px-6">
        <div className="mb-10 text-center">
          <div className="inline-flex items-center justify-center p-3 bg-indigo-50 rounded-2xl mb-4">
            <Camera className="w-8 h-8 text-indigo-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">System Check</h1>
          <p className="text-gray-500 mt-3 text-lg max-w-2xl mx-auto">
            Before we begin your recorded video interview, let's ensure your camera and microphone are working perfectly.
          </p>
        </div>

        <Card className="p-8 border-none shadow-xl bg-white rounded-3xl overflow-hidden relative">
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500"></div>
          
          <div className="grid md:grid-cols-2 gap-10">
            {/* Left Column - Video Preview */}
            <div className="space-y-6">
              <div className="relative rounded-2xl overflow-hidden bg-gray-900 aspect-video shadow-inner ring-1 ring-black/5">
                {cameraError ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                    <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
                      <AlertTriangle className="w-8 h-8 text-red-500" />
                    </div>
                    <p className="text-white font-medium">{cameraError}</p>
                    <Button onClick={handleRetryCamera} className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full">
                      Retry Camera
                    </Button>
                  </div>
                ) : (
                  <>
                    {!isPlaying ? (
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover transform -scale-x-100 transition-opacity duration-500"
                        style={{ opacity: stream ? 1 : 0 }}
                      />
                    ) : (
                      <video
                        src={recordedUrl!}
                        autoPlay
                        playsInline
                        onEnded={() => setIsPlaying(false)}
                        className="w-full h-full object-cover transform -scale-x-100"
                      />
                    )}
                    
                    {isRecording && (
                      <div className="absolute top-4 right-4 flex items-center gap-2 bg-black/60 backdrop-blur-md text-white px-3 py-1.5 rounded-full text-sm font-medium animate-pulse border border-white/10">
                        <div className="w-2.5 h-2.5 bg-red-500 rounded-full"></div>
                        Recording...
                      </div>
                    )}
                    
                    {!cameraError && !isRecording && !isPlaying && stream && (
                      <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end">
                        <div className="bg-black/50 backdrop-blur-md rounded-lg p-2.5 flex items-center gap-2 border border-white/10">
                          <Mic className={`w-4 h-4 ${micLevel > 10 ? 'text-green-400' : 'text-gray-400'}`} />
                          <div className="flex gap-1 h-3 items-end">
                            {[1, 2, 3, 4, 5].map((i) => (
                              <div
                                key={i}
                                className={`w-1.5 rounded-t-sm transition-all duration-75 ${micLevel > i * 15 ? 'bg-green-400' : 'bg-gray-600'}`}
                                style={{ height: Math.max(20, Math.min(100, (micLevel / 50) * 100)) * (i / 5) + '%' }}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {!cameraError && (
                <div className="flex gap-3 justify-center">
                  <Button
                    onClick={handleRecordTestClip}
                    disabled={isRecording || isPlaying}
                    className="flex-1 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 border-none h-12 font-medium"
                    variant="outline"
                  >
                    {isRecording ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Recording (10s)...</>
                    ) : (
                      <><Video className="w-4 h-4 mr-2 text-indigo-600" /> Record Test</>
                    )}
                  </Button>

                  <Button
                    onClick={handlePlayClip}
                    disabled={!hasRecorded || isRecording || isPlaying}
                    className="flex-1 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 border-none h-12 font-medium disabled:opacity-50"
                    variant="outline"
                  >
                    <Play className="w-4 h-4 mr-2 text-indigo-600" /> Play Test
                  </Button>
                </div>
              )}
            </div>

            {/* Right Column - Info & Next Steps */}
            <div className="flex flex-col justify-between py-2">
              <div className="space-y-6">
                <div className="flex gap-4 p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100/50">
                  <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 text-base mb-1">Look your best</h3>
                    <p className="text-sm text-gray-600 leading-relaxed">Ensure you are in a well-lit room and clearly visible in the center of the frame. Speak clearly to verify your audio.</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-500" /> Prerequisites
                  </h4>
                  <ul className="space-y-3 text-sm text-gray-600">
                    <li className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${stream ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                      Camera and Microphone permissions granted
                    </li>
                    <li className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-green-500"></div>
                      Stable internet connection
                    </li>
                    <li className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-green-500"></div>
                      Quiet environment
                    </li>
                  </ul>
                </div>
              </div>

              <div className="pt-8 mt-auto">
                <Button
                  onClick={() => setInInterviewSession(true)}
                  disabled={!!cameraError || !stream}
                  className="w-full h-14 rounded-xl text-lg font-medium shadow-lg shadow-indigo-200 transition-transform active:scale-[0.98]"
                  style={{ backgroundColor: '#6366F1' }}
                >
                  Enter Assessment Environment
                </Button>
                <p className="text-center text-xs text-gray-400 mt-4">
                  By entering, you agree to our proctoring and privacy guidelines.
                </p>
              </div>
            </div>
          </div>
        </Card>
      </main>
    );
  };

  return ("""
content = re.sub(setup_pattern, new_render, content, flags=re.DOTALL)

# Remove the Progress Steps bar from the JSX rendering
progress_bar_pattern = r'\{/\* Progress Steps \*/\}.*?\{/\* Conditionally render setup or interview session \*/\}'
content = re.sub(r'\{/\* Progress Steps \*/\}.*?</Card>\s*</div>', '', content, flags=re.DOTALL)

with open('/home/adham-ashraf/Documents/GitHub/EraMatch/Frontend/candidate-portal/src/components/RecordedInterviewFlow.tsx', 'w') as f:
    f.write(content)
