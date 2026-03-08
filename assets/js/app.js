// ============================================
        // API CONFIGURATION & STATE (Hoisted for safety)
        // ============================================
        
        // Per-calendar cache: Map<calendarId, { data, timestamp, date }>
        const cinecaCacheMap = new Map();
        const cinecaFetchPromiseMap = new Map();

        // Wait for DOM and lazy-loaded OpenSeadragon before booting the app
        let domReady = false;
        let osdReady = false;
        let osdLoadPromise = null;

        function checkAndInit() {
            if (domReady && osdReady) {
                initApp();
            }
        }

        function loadOpenSeadragon() {
            if (osdLoadPromise) return osdLoadPromise;

            osdLoadPromise = new Promise((resolve, reject) => {
                if (typeof OpenSeadragon !== 'undefined') {
                    resolve(window.OpenSeadragon);
                    return;
                }

                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/openseadragon/4.1.0/openseadragon.min.js';
                script.async = true;
                script.defer = true;
                script.onload = () => resolve(window.OpenSeadragon);
                script.onerror = () => reject(new Error('Failed to load OpenSeadragon'));
                document.head.appendChild(script);
            }).then(() => {
                osdReady = true;
                checkAndInit();
            }).catch((error) => {
                console.error(error);
            });

            return osdLoadPromise;
        }

        function kickOffOpenSeadragonLoad() {
            const loader = () => loadOpenSeadragon();
            if (window.requestIdleCallback) {
                requestIdleCallback(loader, { timeout: 1200 });
            } else {
                setTimeout(loader, 250);
            }
        }



        function markDomReady() {
            domReady = true;
            checkAndInit();
        }

        // Check if DOM is ready and then lazily load OpenSeadragon
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                markDomReady();
                kickOffOpenSeadragonLoad();
            });
        } else {
            markDomReady();
            kickOffOpenSeadragonLoad();
        }

        // Main initialization function
        function initApp() {
            // Gestione tastiera mobile per la barra di ricerca
            const mobileSearchContainer = document.getElementById('mobile-search-container');
            const searchInputMobileElement = document.getElementById('search-input-mobile');

            let keyboardViewportAdjustmentActive = false;
            let viewportResizeRaf = null;
            let visualViewportListenersAttached = false;

            // Setup global delegated listeners
            setupDelegatedListeners();
            setupSidebarDelegation();

            function setupDelegatedListeners() {
                // Search Results Delegation
                const searchResultsContainer = document.getElementById('search-results');
                const searchResultsMobileContainer = document.getElementById('search-results-mobile');

                const handleSearchResultInteraction = (e) => {
                    const resultItem = e.target.closest('.search-result-item');
                    // Ignora se non siamo su un item o se stiamo interagendo con impostazioni (che hanno i loro listener)
                    if (!resultItem || resultItem.closest('.load-more-container') || resultItem.querySelector('input[type="checkbox"]')) return;

                    const globalIndex = parseInt(resultItem.dataset.index, 10);
                    if (isNaN(globalIndex)) return;

                    // Retrieve result from global array
                    const result = allSearchResults[globalIndex];
                    if (!result) return;

                    if (e.type === 'click') {
                        handleSearchResultClick(e, resultItem, result);
                    } else if (e.type === 'mouseover') {
                        handleSearchResultMouseEnter(e, resultItem, globalIndex);
                    } else if (e.type === 'mouseout') {
                        handleSearchResultMouseLeave(e, resultItem, globalIndex);
                    }
                };

                const attachDelegation = (container) => {
                    if (!container) return;
                    container.addEventListener('click', handleSearchResultInteraction);
                    container.addEventListener('mouseover', handleSearchResultInteraction);
                    container.addEventListener('mouseout', handleSearchResultInteraction);
                };

                attachDelegation(searchResultsContainer);
                attachDelegation(searchResultsMobileContainer);
            }

            function handleSearchResultClick(e, element, result) {
                // Check if we clicked on specific children that should NOT trigger the main action
                if (e.target.closest('.occupancy-status-bar') || e.target.closest('.occupancy-expand-icon')) {
                    return;
                }

                // Logic for Suggestion
                if (result.suggestion) {
                    const currentSearchInput = isMobile() ? searchInputMobile : searchInput;
                    const otherSearchInput = isMobile() ? searchInput : searchInputMobile;

                    let newValue = '';
                    if (result.type === 'settings') {
                        newValue = currentLanguage === 'it' ? 'Impostazioni' : 'Settings';
                    } else if (result.type === 'share_suggestion') {
                        newValue = currentLanguage === 'it' ? 'Condividi' : 'Share';
                    } else if (result.type === 'feedback_suggestion') {
                        newValue = 'Feedback';
                    } else if (result.type === 'bot_suggestion') {
                        newValue = 'Bot';
                    }

                    currentSearchInput.value = newValue;
                    if (otherSearchInput) otherSearchInput.value = newValue;
                    updateClearButtonsVisibility();

                    setTimeout(() => {
                        searchRooms(newValue);
                        currentSearchInput.focus();
                    }, 10);
                    return;
                }

                // Logic for Bot
                if (result.type === 'bot' || result.type === 'bot_promo') {
                    window.open(result.url, '_blank');
                    const currentSearchInput = isMobile() ? searchInputMobile : searchInput;
                    setTimeout(() => currentSearchInput.focus(), 50);
                    return;
                }

                // Logic for Feedback
                if (result.type === 'feedback') {
                    if (result.action === 'email') {
                        window.open('mailto:lyubomyr.malay@icloud.com?subject=' + encodeURIComponent('FEEDBACK DOVE?UNIPI'), '_blank');
                    } else if (result.action === 'github') {
                        window.open('https://github.com/plumkewe/dove-unipi/issues/new', '_blank');
                    }
                    const currentSearchInput = isMobile() ? searchInputMobile : searchInput;
                    setTimeout(() => currentSearchInput.focus(), 50);
                    return;
                }

                // Logic for Share
                if (result.type === 'share') {
                    navigator.clipboard.writeText(result.url).then(() => {
                        element.classList.add('selected');
                        const iconElement = element.querySelector('[data-copy-icon]');
                        if (iconElement) {
                            const originalIcon = iconElement.textContent;
                            iconElement.textContent = 'check';
                            setTimeout(() => {
                                iconElement.textContent = originalIcon;
                            }, 2500);
                        }
                        setTimeout(() => {
                            element.classList.remove('selected');
                        }, 2500);
                    }).catch(err => {
                        console.error('Errore nella copia del link: ', err);
                    });
                    const currentSearchInput = isMobile() ? searchInputMobile : searchInput;
                    setTimeout(() => currentSearchInput.focus(), 50);
                    return;
                }

                // Logic for Polo
                if (result.type === 'polo_result') {
                    const currentSearchInput = isMobile() ? searchInputMobile : searchInput;

                    selectPolo(result.polo, result.edificio || null, null, null, 'top', null);
                    hideSearchResultsPanels();
                    
                    const displayName = result.title;
                    currentSearchInput.value = displayName;

                    const otherInput = currentSearchInput === searchInput ? searchInputMobile : searchInput;
                    otherInput.value = displayName;
                    updateClearButtonsVisibility();

                    triggerSidebarButtonAnimation();
                    if (isMobile()) {
                        closeSidebar();
                    }
                    return;
                }

                // Logic for Room/Person
                if (result.room) {
                    // External library (from biblioteche.json) - opens Google Maps
                    if (result.type === 'external_library') {
                        const googleMapsUrl = result.room['google maps'];
                        if (googleMapsUrl) {
                            window.open(googleMapsUrl, '_blank');
                        }
                        const currentSearchInput = isMobile() ? searchInputMobile : searchInput;
                        setTimeout(() => currentSearchInput.focus(), 50);
                        return;
                    }

                    const currentSearchInput = isMobile() ? searchInputMobile : searchInput;

                    selectRoom(result.polo, result.edificio, result.piano, result.room);
                    hideSearchResultsPanels();
                    
                    // Use ricerca field for consistent display
                    const displayName = result.room.ricerca || result.room.nome;

                    currentSearchInput.value = displayName;

                    const otherInput = currentSearchInput === searchInput ? searchInputMobile : searchInput;
                    otherInput.value = displayName;
                    updateClearButtonsVisibility();

                    setTimeout(() => {
                        expandRoomDetailsInSidebar(result.room);
                    }, 100);

                    triggerSidebarButtonAnimation();

                    if (isMobile()) {
                        closeSidebar();
                    }
                }
            }

            function handleSearchResultMouseEnter(e, element, globalIndex) {
                if (isTouchDevice()) return;
                if (isKeyboardSelection || document.body.classList.contains('keyboard-navigation-active')) {
                    return;
                }
                updateSelectedSearchResult(globalIndex);
            }

            function handleSearchResultMouseLeave(e, element, globalIndex) {
                if (isTouchDevice()) return;
                if (isKeyboardSelection || document.body.classList.contains('keyboard-navigation-active')) {
                    return;
                }
                if (selectedSearchResultIndex === globalIndex) {
                    element.classList.remove('selected');
                    selectedSearchResultIndex = -1;
                }
            }


            function setupSidebarDelegation() {
                const sidebarContent = document.getElementById('rooms-list').parentElement; // Using parent to catch everything
                if (!sidebarContent) return;

                sidebarContent.addEventListener('click', (e) => {
                    // 1. Handle Expand/Collapse of Rooms/Libraries
                    // Look for the header element or the expand icon
                    // We need to target the row that contains the room info

                    const roomHeader = e.target.closest('[data-room-name]');
                    const scheduleBtn = e.target.closest('[data-action="show-schedule"]');

                    if (scheduleBtn) {
                        const libName = scheduleBtn.dataset.libName;
                        handleLibraryScheduleClick(libName);
                        return;
                    }

                    if (roomHeader) {
                        e.preventDefault();
                        const roomName = roomHeader.dataset.roomName;

                        // Let's store these in the element
                        const polo = roomHeader.dataset.polo;
                        const building = roomHeader.dataset.building;
                        const floor = roomHeader.dataset.floor;

                        // We need the room object for `isRoomEligibleForShortLink` and `centerMapOnRoom`.
                        // Re-fetching it from `data` is safe.

                        const roomData = findRoomData(polo, building, floor, roomName);
                        if (!roomData) return;

                        handleRoomItemClick(e, roomHeader, roomData, polo, building, floor);
                    }
                });
            }

            function findRoomData(polo, building, floor, roomName) {
                if (!data.polo[polo] || !data.polo[polo].edificio[building]) return null;
                const floorData = data.polo[polo].edificio[building].piano[floor];
                if (!floorData) return null;

                const rooms = Array.isArray(floorData) ? floorData : (floorData?.aule ? Object.values(floorData.aule) : []);
                return rooms.find(r => r.nome === roomName);
            }

            function handleLibraryScheduleClick(libName) {
                // Chiudi la sidebar se su mobile
                if (isMobile()) {
                    closeSidebar();
                }

                // Imposta il valore di ricerca
                const searchVal = libName;
                searchInput.value = searchVal;
                searchInputMobile.value = searchVal;
                // currentSearchInput = isMobile() ? searchInputMobile : searchInput; // Updated by searchRooms usually? No, manually.

                // Triggera la ricerca
                searchRooms(searchVal); // This calls performSearch internally if needed or just filters? 
                // Wait, original code called `performSearch(searchVal)` but `searchRooms` is the main entry?
                // Let's use `searchRooms` which is safe.

                // Espandi automaticamente gli orari dopo che i risultati sono stati renderizzati
                setTimeout(() => {
                    const container = isMobile() ? document.getElementById('search-results-mobile') : document.getElementById('search-results');
                    if (!container) return;

                    const results = container.querySelectorAll('.search-result-item');
                    results.forEach(result => {
                        const title = result.querySelector('.title');
                        // Need strict match or partial? Original used textContent check
                        if (title && title.textContent === libName) {
                            const expandIcon = result.querySelector('.occupancy-expand-icon');
                            const detailsElement = result.querySelector('.occupancy-details');

                            if (expandIcon && detailsElement && !detailsElement.classList.contains('expanded')) {
                                detailsElement.classList.add('expanded');
                                expandIcon.classList.add('expanded');

                                setTimeout(() => {
                                    result.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                }, 100);
                            }
                        }
                    });
                }, 100);
            }

            function handleRoomItemClick(e, roomElement, room, polo, building, floor) {
                // Logic from original click listener

                // Determina se stiamo chiudendo i dettagli (se sono già visibili)
                const roomContainer = roomElement.parentNode;
                const roomInfoElement = roomContainer.querySelector('.capacity-info');
                const isClosing = roomInfoElement && !roomInfoElement.classList.contains('hidden');

                if (isRoomEligibleForShortLink(room)) {
                    if (!isClosing) {
                        setShortLinkContext({
                            polo: polo,
                            building: building,
                            floor: floor,
                            room
                        });
                        updateURL(true);
                    } else {
                        // When closing, we specifically do NOT want to update the URL or clear context
                        // because that triggers a map reset/zoom which the user wants to avoid.
                        // clearShortLinkContext();
                        // updateURL(true);
                    }
                } else {
                    if (!isClosing) {
                        clearShortLinkContext();
                    }
                }

                // Center map ONLY if we are OPENING details (not closing)
                if (!isClosing) {
                    centerMapOnRoom(room);
                } else {
                    clearSelectedRoomMarker();
                }

                requestAnimationFrame(() => {
                    // Toggle details
                    if (roomInfoElement && roomInfoElement.innerHTML.trim() !== '') {
                        roomInfoElement.classList.toggle('hidden');
                        const expandIcon = roomElement.querySelector('.expand-icon');
                        if (expandIcon) {
                            expandIcon.style.transform = roomInfoElement.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
                        }
                    }
                });
            }

            // Funzione per gestire il ridimensionamento della viewport (quando si apre la tastiera)
            function handleViewportResize() {
                if (!isKeyboardViewportAdjustmentActive()) {
                    return;
                }
                if (!mobileSearchContainer || !window.visualViewport) return;

                // Calcola lo spostamento necessario
                const viewportHeight = window.visualViewport.height;
                const windowHeight = window.innerHeight;
                const keyboardHeight = windowHeight - viewportHeight;

                // Se la tastiera è aperta (differenza > 100px per evitare falsi positivi)
                if (keyboardHeight > 100) {
                    // Sposta la barra di ricerca sopra la tastiera
                    // Aggiungi un offset extra di 16px per un po' di padding
                    mobileSearchContainer.style.bottom = `${keyboardHeight + 16}px`;
                } else {
                    // Ripristina la posizione originale
                    mobileSearchContainer.style.bottom = '48px';
                }
            }

            function isKeyboardViewportAdjustmentActive() {
                return keyboardViewportAdjustmentActive && !!window.visualViewport;
            }

            function scheduleViewportResize() {
                if (!isKeyboardViewportAdjustmentActive()) return;
                if (viewportResizeRaf) return;
                viewportResizeRaf = requestAnimationFrame(() => {
                    viewportResizeRaf = null;
                    handleViewportResize();
                });
            }

            function attachVisualViewportListeners() {
                if (!window.visualViewport || visualViewportListenersAttached) return;
                window.visualViewport.addEventListener('resize', scheduleViewportResize);
                window.visualViewport.addEventListener('scroll', scheduleViewportResize);
                visualViewportListenersAttached = true;
            }

            function detachVisualViewportListeners() {
                if (!window.visualViewport || !visualViewportListenersAttached) return;
                window.visualViewport.removeEventListener('resize', scheduleViewportResize);
                window.visualViewport.removeEventListener('scroll', scheduleViewportResize);
                visualViewportListenersAttached = false;
            }

            // Fallback per dispositivi che non supportano visualViewport
            // Monitora il focus sull'input di ricerca mobile
            if (searchInputMobileElement) {
                searchInputMobileElement.addEventListener('focus', () => {
                    keyboardViewportAdjustmentActive = true;

                    if (window.visualViewport) {
                        attachVisualViewportListeners();
                        // Usa un timeout per dare tempo alla tastiera di aprirsi
                        setTimeout(() => {
                            if (isKeyboardViewportAdjustmentActive()) {
                                scheduleViewportResize();
                            }
                        }, 250);
                    } else {
                        // Fallback: scroll per mantenere l'input visibile
                        setTimeout(() => {
                            searchInputMobileElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }, 300);
                    }
                });

                searchInputMobileElement.addEventListener('blur', () => {
                    keyboardViewportAdjustmentActive = false;
                    if (viewportResizeRaf) {
                        cancelAnimationFrame(viewportResizeRaf);
                        viewportResizeRaf = null;
                    }
                    detachVisualViewportListeners();
                    // Quando l'input perde il focus, ripristina la posizione
                    setTimeout(() => {
                        if (mobileSearchContainer) {
                            mobileSearchContainer.style.bottom = '48px';
                        }
                    }, 100);
                });
            }

            const preventNativeZoomGestures = () => {
                let lastTouchEnd = 0;

                const allowInsideViewer = (event) => {
                    const target = event.target;
                    return target && (target.closest('#map') || target.closest('#viewer-container'));
                };

                document.addEventListener('gesturestart', (event) => {
                    if (allowInsideViewer(event)) return; // Lascia che OpenSeadragon gestisca pinch/zoom
                    event.preventDefault();
                }, { passive: false });

                document.addEventListener('gesturechange', (event) => {
                    if (allowInsideViewer(event)) return;
                    event.preventDefault();
                }, { passive: false });

                document.addEventListener('gestureend', (event) => {
                    if (allowInsideViewer(event)) return;
                    event.preventDefault();
                }, { passive: false });

                document.addEventListener('touchend', (event) => {
                    if (allowInsideViewer(event)) return; // Permetti doppio tap/pinch sul viewer
                    const now = Date.now();
                    if (now - lastTouchEnd <= 350) {
                        event.preventDefault();
                    }
                    lastTouchEnd = now;
                }, { passive: false });
            };

            preventNativeZoomGestures();

            const tooltipElement = document.getElementById('tooltip');

            function getShortcutModifiers() {
                const isMac = /Mac/i.test(navigator.userAgent);
                if (isMac) {
                    return '⌃⌥';
                }
                return 'Ctrl+Shift+';
            }

            const showTooltip = (event) => {
                if (isTouchDevice()) return; // Non mostrare tooltip su dispositivi touch
                const target = event.currentTarget;
                if ((target.id === 'share-btn' || target.closest('#zoom-controls')) && !accessibilityToggle.checked) {
                    return;
                }
                let tooltipText = target.getAttribute('data-tooltip');
                if (!tooltipText) return;

                const shortcutKey = target.getAttribute('data-shortcut');
                if (shortcutKey) {
                    const isMac = /Mac/i.test(navigator.userAgent);
                    let modifiers = '';
                    let keyDisplay = shortcutKey.toUpperCase();

                    if (shortcutKey.toLowerCase() === 'enter') {
                        modifiers = isMac ? '⌘' : 'Ctrl+';
                        keyDisplay = 'Enter';
                    } else {
                        modifiers = getShortcutModifiers();
                    }

                    const shortcutDisplay = `${modifiers}${keyDisplay}`;
                    tooltipText += ` (${shortcutDisplay})`;
                }

                // Applica il testo e rendi visibile per calcolare le dimensioni
                tooltipElement.textContent = tooltipText;
                tooltipElement.classList.add('visible');

                const targetRect = target.getBoundingClientRect();
                const tooltipRect = tooltipElement.getBoundingClientRect();

                const gap = 10;

                // Posizione di default: centrato sopra
                let top = targetRect.top - tooltipRect.height - gap;
                let left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);

                // Se non c'è spazio sopra, mettilo sotto
                if (top < 0) {
                    top = targetRect.bottom + gap;
                }

                // Aggiustamenti orizzontali
                if (left < 0) {
                    // Se esce a sinistra, allinealo a sinistra
                    left = gap;
                } else if (left + tooltipRect.width > window.innerWidth) {
                    // Se esce a destra, allinealo a destra
                    left = window.innerWidth - tooltipRect.width - gap;
                }

                tooltipElement.style.top = `${top}px`;
                tooltipElement.style.left = `${left}px`;
            };

            const hideTooltip = () => {
                tooltipElement.classList.remove('visible');
            };

            const initializeTooltips = () => {
                document.querySelectorAll('[data-tooltip]').forEach(element => {
                    element.addEventListener('mouseenter', showTooltip);
                    element.addEventListener('mouseleave', hideTooltip);
                });
            };

            initializeTooltips(); // Inizializza per gli elementi statici

            const appContainer = document.getElementById('app-container');
            const sidebar = document.getElementById('sidebar');
            const mainContent = document.getElementById('main-content');

            const openSidebarBtn = document.getElementById('open-sidebar-button');
            const closeSidebarBtn = document.getElementById('close-sidebar-button');

            const polosList = document.getElementById('polos-list');
            const buildingsList = document.getElementById('buildings-list');
            const floorsList = document.getElementById('floors-list');
            const roomsList = document.getElementById('rooms-list');
            const viewerContainer = document.getElementById('viewer-container');

            // Nuovi elementi per i controlli
            const zoomControls = document.getElementById('zoom-controls');
            const zoomInBtn = document.getElementById('zoom-in-btn');
            const zoomOutBtn = document.getElementById('zoom-out-btn');
            const resetZoomBtn = document.getElementById('reset-zoom-btn');
            const viewControls = document.getElementById('view-controls');
            const flipViewBtn = document.getElementById('flip-view-btn');
            if (flipViewBtn) {
                flipViewBtn.setAttribute('aria-pressed', 'false');
            }

            // Elementi della barra di ricerca
            const searchInput = document.getElementById('search-input');
            const searchResults = document.getElementById('search-results');
            const searchInputMobile = document.getElementById('search-input-mobile');
            const searchResultsMobile = document.getElementById('search-results-mobile');
            const clearSearchBtn = document.getElementById('clear-search-btn');
            const clearSearchBtnMobile = document.getElementById('clear-search-btn-mobile');
            const settingsBtn = document.getElementById('settings-btn');
            const shareBtn = document.getElementById('share-btn');
            const accessibilityToggle = document.getElementById('accessibility-toggle');
            const storedShareCoordinates = localStorage.getItem('shareCoordinatesEnabled');
            const storedHighContrast = localStorage.getItem('highContrastEnabled');
            const storedDyslexicFont = localStorage.getItem('dyslexicFontEnabled');
            const storedTextSize = localStorage.getItem('textSizeEnabled');
            const storedShowWaterDispensers = localStorage.getItem('showWaterDispensersEnabled');
            const storedShowStudyRooms = localStorage.getItem('showStudyRoomsEnabled');
            const storedShowClassroomStatus = localStorage.getItem('showClassroomStatusEnabled');
            const storedShowGroundFloor = localStorage.getItem('showGroundFloorEnabled');
            const storedCopyLinkOnSelect = localStorage.getItem('copyLinkOnSelectEnabled');
            const storedPoiBlinking = localStorage.getItem('poiBlinkingEnabled');

            // Detect browser language automatically
            function detectBrowserLanguage() {
                const browserLang = navigator.language || navigator.userLanguage;
                // Extract the language code (e.g., 'it' from 'it-IT', 'en' from 'en-US')
                const langCode = browserLang.split('-')[0].toLowerCase();
                // Support only 'it' and 'en', default to 'it' for others
                return (langCode === 'it' || langCode === 'en') ? langCode : 'it';
            }

            const storedLanguage = localStorage.getItem('selectedLanguage') || detectBrowserLanguage();

            const settingsConfig = {
                shareCoordinates: storedShareCoordinates ? storedShareCoordinates === 'true' : true,
                highContrast: storedHighContrast ? storedHighContrast === 'true' : false,
                dyslexicFont: storedDyslexicFont ? storedDyslexicFont === 'true' : false,
                showWaterDispensers: storedShowWaterDispensers ? storedShowWaterDispensers === 'true' : true,
                showStudyRooms: storedShowStudyRooms ? storedShowStudyRooms === 'true' : true,
                showClassroomStatus: storedShowClassroomStatus ? storedShowClassroomStatus === 'true' : true, // Default to true
                showGroundFloor: storedShowGroundFloor ? storedShowGroundFloor === 'true' : true, // Default to true = "Piano Terra"
                copyLinkOnSelect: storedCopyLinkOnSelect ? storedCopyLinkOnSelect === 'true' : false,
                poiBlinking: storedPoiBlinking ? storedPoiBlinking === 'true' : false,
                language: storedLanguage
            };

            // Localization system
            let translations = {};
            let currentLanguage = storedLanguage;

            // Load translations
            async function loadTranslations(lang) {
                try {
                    const response = await fetch(`${getSiteRootPath()}locales/${lang}.json`);
                    const data = await response.json();
                    translations = data;
                    currentLanguage = lang;
                    return true;
                } catch (error) {
                    console.error('Error loading translations:', error);
                    return false;
                }
            }

            // Get translated text
            function t(key) {
                if (translations[key]) {
                    return translations[key].translation || translations[key].original;
                }
                return key;
            }

            // Apply translations to the page
            function applyTranslations() {

                // Update meta tags
                const metaDescription = document.querySelector('meta[name="description"]');
                if (metaDescription) metaDescription.content = t('meta_description');

                const metaOgTitle = document.querySelector('meta[property="og:title"]');
                if (metaOgTitle) metaOgTitle.content = t('meta_og_title');

                const metaOgDescription = document.querySelector('meta[property="og:description"]');
                if (metaOgDescription) metaOgDescription.content = t('meta_og_description');

                const metaTwitterTitle = document.querySelector('meta[name="twitter:title"]');
                if (metaTwitterTitle) metaTwitterTitle.content = t('meta_og_title');

                const metaTwitterDescription = document.querySelector('meta[name="twitter:description"]');
                if (metaTwitterDescription) metaTwitterDescription.content = t('meta_og_description');

                // Update HTML lang attribute
                document.documentElement.lang = currentLanguage;

                // Update og:locale based on language
                const metaOgLocale = document.querySelector('meta[property="og:locale"]');
                if (metaOgLocale) {
                    metaOgLocale.content = currentLanguage === 'en' ? 'en_US' : 'it_IT';
                }

                // Update search placeholders (con controllo se esistono)
                if (searchInput) searchInput.placeholder = t('search_classroom');
                if (searchInputMobile) searchInputMobile.placeholder = t('search_classroom');

                // Update tooltips (con controllo se esistono)
                if (openSidebarBtn) openSidebarBtn.setAttribute('data-tooltip', t('sidebar_open'));
                if (closeSidebarBtn) closeSidebarBtn.setAttribute('data-tooltip', t('sidebar_close'));
                if (shareBtn) {
                    shareBtn.setAttribute('data-tooltip', t('share_button'));
                    shareBtn.setAttribute('aria-label', t('share_aria_label'));
                }
                if (flipViewBtn) {
                    flipViewBtn.setAttribute('data-tooltip', t('view_flip'));
                    flipViewBtn.setAttribute('aria-label', t('view_flip'));
                }
                if (zoomInBtn) {
                    zoomInBtn.setAttribute('data-tooltip', t('zoom_in'));
                    zoomInBtn.setAttribute('aria-label', t('zoom_in'));
                }
                if (zoomOutBtn) {
                    zoomOutBtn.setAttribute('data-tooltip', t('zoom_out'));
                    zoomOutBtn.setAttribute('aria-label', t('zoom_out'));
                }
                if (resetZoomBtn) {
                    resetZoomBtn.setAttribute('data-tooltip', t('zoom_reset'));
                    resetZoomBtn.setAttribute('aria-label', t('zoom_reset'));
                }

                // Update sidebar title
                const sidebarTitle = document.querySelector('#sidebar .text-2xl');
                if (sidebarTitle) {
                    sidebarTitle.textContent = t('app_title');
                }

                // Update footer
                const footerSpan = document.querySelector('.fixed.bottom-4 span.text-sm');
                if (footerSpan) {
                    footerSpan.innerHTML = `
                        ${t('made_with')} 
                        <span class="material-symbols-outlined" style="font-size: 16px; vertical-align: -3px;">favorite</span> 
                        ${t('made_and')} 
                        <span class="material-symbols-outlined" style="font-size: 16px; vertical-align: -3px;">smart_toy</span> 
                        ${t('made_by')} <a href="https://github.com/plumkewe" target="_blank" class="underline font-medium hover-text-effect">Lyubomyr Malay</a>
                    `;
                }

                // Update GitHub link text
                const githubLinkText = document.getElementById('github-link-text');
                if (githubLinkText) {
                    githubLinkText.textContent = t('github_repository');
                }

                // Update sidebar section titles
                const buildingsTitle = document.getElementById('buildings-title');
                if (buildingsTitle) {
                    buildingsTitle.textContent = t('buildings_title');
                }

                const floorsTitle = document.getElementById('floors-title');
                if (floorsTitle) {
                    floorsTitle.textContent = t('floors_title');
                }

                const roomsTitle = document.getElementById('rooms-title');
                if (roomsTitle) {
                    roomsTitle.textContent = t('rooms_title');
                }

                // Update search suggestions
                searchSuggestions[0] = t('search_classroom');
                searchSuggestions[1] = t('search_surname');
                searchSuggestions[2] = t('search_number');
                searchSuggestions[3] = t('search_suggestion_settings');
                searchSuggestions[4] = t('search_suggestion_classroom');
                searchSuggestions[5] = t('search_suggestion_capacity');
                searchSuggestions[6] = t('search_suggestion_department');
                searchSuggestions[7] = t('search_suggestion_share');

                // Riavvia il ciclo dei suggerimenti con le nuove traduzioni
                currentSuggestionIndex = 0;
                startSearchPlaceholderCycle();

                // Refresh current search results if visible
                const currentQuery = isMobile() ? (searchInputMobile ? searchInputMobile.value : '') : (searchInput ? searchInput.value : '');
                if (currentQuery) {
                    searchRooms(currentQuery);
                }
            }

            // Apply initial high contrast setting
            setHighContrastSetting(settingsConfig.highContrast);

            // Apply initial dyslexic font setting
            setDyslexicFontSetting(settingsConfig.dyslexicFont);
            setPoiBlinkingSetting(settingsConfig.poiBlinking);
            setTextSizeSetting(storedTextSize || 'text-normal');

            // Initialize all text size controls properlye
            let translationsLoaded = false;

            async function ensureTranslationsLoaded() {
                if (!translationsLoaded) {
                    const success = await loadTranslations(currentLanguage);
                    if (success) {
                        translationsLoaded = true;
                        applyTranslations();
                        return true;
                    }
                    return false;
                }
                return true;
            }

            // Initial load
            ensureTranslationsLoaded().then(success => {
                if (!success) {
                    // Retry after a short delay if initial load failed (network issues on mobile)
                    console.warn('Initial translation load failed, retrying...');
                    setTimeout(() => ensureTranslationsLoaded(), 1000);
                }
            });

            // Reapply translations when DOM is fully ready (helps with mobile)
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => {
                    if (translationsLoaded) {
                        applyTranslations();
                    }
                });
            }

            // Gestione controlli accessibilità
            const setAccessibilityControls = (visible) => {
                if (visible) {
                    shareBtn.classList.remove('hidden');
                    zoomControls.classList.remove('hidden');
                } else {
                    shareBtn.classList.add('hidden');
                    zoomControls.classList.add('hidden');
                    hideTooltip();
                }
            };

            // Controlla lo stato salvato al caricamento
            const savedAccessibilityState = localStorage.getItem('accessibilityEnabled') === 'true';
            accessibilityToggle.checked = savedAccessibilityState;
            setAccessibilityControls(savedAccessibilityState);
            syncSettingsToggles();

            // Aggiungi listener per il cambio di stato
            accessibilityToggle.addEventListener('change', () => {
                const isEnabled = accessibilityToggle.checked;
                setAccessibilityControls(isEnabled);
                localStorage.setItem('accessibilityEnabled', isEnabled);
                syncSettingsToggles();
            });

            // ============================================
            // CONFIGURAZIONE API
            // ============================================
            // const API_BASE_URL = 'https://classroom-status-api-fsgzezg5a8e0ewgc.italynorth-01.azurewebsites.net';

            // Configurazione Lingue Supportate
            const SUPPORTED_LANGUAGES = [
                { code: 'it', label: 'IT', title: 'Italiano' },
                { code: 'en', label: 'EN', title: 'English' },
                { code: 'pi', label: 'PI', title: 'Vernacolo Pisano' }
            ];

            let data = {};
            let biblioteche = []; // Biblioteche dall'SBA non presenti su DOVE?UNIPI
            let selectedPolo = '';
            let selectedBuilding = '';
            let selectedFloor = '0';
            let lastLoadedBuilding = null;
            let lastLoadedFloor = null;
            let lastLoadedPolo = null;
            let currentView = 'top'; // 'perspective' o 'top'
            let viewer = null; // Istanza OpenSeadragon
            let selectedSearchResultIndex = -1;
            let isKeyboardSelection = false;
            let waterDispenserOverlays = []; // Array per gli overlay degli erogatori d'acqua
            let studyRoomOverlays = []; // Array per gli overlay delle aule studio
            const markerRoomDataMap = new Map(); // Map per memorizzare i dati delle stanze associate ai marker (per event delegation)
            let shortLinkContext = null;
            let canonicalContextOverride = null;
            let viewerInteractionGuardsInstalled = false;
            let programmaticMapChange = false;
            let programmaticMapChangeResetTimeout = null;
            let isMapFlipped = false;
            const buildingFlipStates = {}; // Store flip state per building
            let allSearchResults = []; // Store all search results for incremental loading
            let currentResultsShown = 0; // Track how many results are currently displayed

            // Sistema di lazy loading e caching per le mappe SVG
            const svgCache = new Map();
            const MAX_CACHE_SIZE = 10; // Massimo numero di SVG in cache
            const cacheAccessOrder = []; // Per gestire LRU (Least Recently Used)

            // Suggerimenti per la ricerca (verranno aggiornati dopo il caricamento delle traduzioni)
            let searchSuggestions = [
                "Cerca un'aula...",
                "Cerca un cognome...",
                "Cerca un numero...",
                "Prova: Impostazioni",
                "Prova: Aula D2",
                "Prova: >200",
                "Prova: Dipartimento",
                "Prova: Condividi"
            ];
            let currentSuggestionIndex = 0;
            let searchPlaceholderInterval = null;

            const SHORT_LINK_ELIGIBLE_TYPES = new Set(['aula', 'dipartimento', 'laboratorio', 'sala', 'biblioteca', 'studio', 'persona']);
            const STATIC_PAGE_EXCLUDED_TYPES = new Set(['persona', 'erogatore_acqua', 'laboratorio', 'dipartimento']);

            function isRoomEligibleForShortLink(room) {
                if (!room) return false;
                if (!room.type) return true; // fallback per dati incompleti (es. PS1/PS4)
                if (Array.isArray(room.type)) {
                    return room.type.some(t => SHORT_LINK_ELIGIBLE_TYPES.has(t));
                }
                return SHORT_LINK_ELIGIBLE_TYPES.has(room.type);
            }

            function getRoomTypes(room) {
              if (!room || !room.type) return new Set();
              if (Array.isArray(room.type)) {
                return new Set(room.type.filter(Boolean));
              }
              return new Set([room.type]);
            }

            function getStaticPageTypes(room) {
              const roomTypes = getRoomTypes(room);
              if (!roomTypes.size) {
                return new Set(['untyped']);
              }
              return new Set([...roomTypes].filter((roomType) => !STATIC_PAGE_EXCLUDED_TYPES.has(roomType)));
            }

            function isCanonicalRoomPageCandidate(room) {
              return getStaticPageTypes(room).size > 0;
            }

            function hasSingleBuildingLayoutForPolo(poloName) {
              const buildings = data?.polo?.[poloName]?.edificio || {};
              const buildingKeys = Object.keys(buildings);
              return buildingKeys.length === 1 && buildingKeys[0] === '';
            }

            function slugifyCanonicalSegment(value) {
              return (value || '')
                .toString()
                .toLowerCase()
                .trim()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9\s-]/g, '')
                .replace(/\s+/g, '-')
                .replace(/-+/g, '-')
                .replace(/^-|-$/g, '');
            }

            function getSiteRootPath() {
              const marker = '/polo/';
              const markerIndex = window.location.pathname.indexOf(marker);
              if (markerIndex !== -1) {
                return window.location.pathname.slice(0, markerIndex + 1);
              }

              if (window.location.pathname.endsWith('/index.html')) {
                return window.location.pathname.slice(0, -'index.html'.length);
              }

              return window.location.pathname.endsWith('/') ? window.location.pathname : `${window.location.pathname}/`;
            }

            function getAppIndexPath() {
              return `${getSiteRootPath()}index.html`;
            }

            function buildCanonicalPoloPath(poloName) {
              return `${getSiteRootPath()}polo/${poloName}/`;
            }

            function buildCanonicalBuildingPath(poloName, buildingName) {
              if (hasSingleBuildingLayoutForPolo(poloName)) {
                return buildCanonicalPoloPath(poloName);
              }
              return `${buildCanonicalPoloPath(poloName)}edificio/${buildingName}/`;
            }

            function buildCanonicalFloorPath(poloName, buildingName, floorName) {
              if (floorName == null || floorName === '') {
                return buildCanonicalBuildingPath(poloName, buildingName);
              }
              if (hasSingleBuildingLayoutForPolo(poloName)) {
                return `${buildCanonicalPoloPath(poloName)}piano/${String(floorName)}/`;
              }
              return `${buildCanonicalBuildingPath(poloName, buildingName)}piano/${String(floorName)}/`;
            }

            function buildCanonicalContextPath(poloName, buildingName = null, floorName = null) {
              if (!poloName) return null;
              if (floorName != null) {
                return buildCanonicalFloorPath(poloName, buildingName || '', floorName);
              }
              if (buildingName != null && buildingName !== '' && !hasSingleBuildingLayoutForPolo(poloName)) {
                return buildCanonicalBuildingPath(poloName, buildingName);
              }
              return buildCanonicalPoloPath(poloName);
            }

            function getRoomsOnFloor(poloName, buildingName, floorName) {
              const floorData = data?.polo?.[poloName]?.edificio?.[buildingName]?.piano?.[floorName];
              if (Array.isArray(floorData)) {
                return floorData;
              }
              if (floorData?.aule) {
                return Object.values(floorData.aule);
              }
              return [];
            }

            function getCanonicalRoomSlug(poloName, buildingName, floorName, targetRoom) {
              if (!targetRoom) return null;

              const floorRooms = getRoomsOnFloor(poloName, buildingName, floorName);
              const usedSlugs = new Set();

              for (const room of floorRooms) {
                if (!isCanonicalRoomPageCandidate(room)) {
                  continue;
                }

                const baseSlug = slugifyCanonicalSegment(room.nome);
                if (!baseSlug) {
                  continue;
                }

                let slug = baseSlug;
                let index = 2;
                while (usedSlugs.has(slug)) {
                  slug = `${baseSlug}-${index}`;
                  index += 1;
                }
                usedSlugs.add(slug);

                if (room === targetRoom || (room.id && targetRoom.id && room.id === targetRoom.id)) {
                  return slug;
                }
              }

              return slugifyCanonicalSegment(targetRoom.nome);
            }

            function buildCanonicalRoomPath(poloName, buildingName, floorName, room) {
              if (!isCanonicalRoomPageCandidate(room)) {
                return null;
              }

              const slug = getCanonicalRoomSlug(poloName, buildingName, floorName, room);
              if (!slug) {
                return null;
              }

              return `${buildCanonicalFloorPath(poloName, buildingName, floorName)}${slug}/`;
            }

            function findRoomById(poloName, buildingName, floorName, roomId) {
              if (!roomId) return null;

              const room = getRoomsOnFloor(poloName, buildingName, floorName)
                .find((candidate) => candidate && candidate.id === roomId);

              if (!room) return null;

              return {
                polo: poloName,
                edificio: buildingName,
                piano: floorName,
                room
              };
            }

            function findStaticDetailOnFloor(poloName, buildingName, floorName, detailId = null, detailSlug = null) {
              const floorRooms = getRoomsOnFloor(poloName, buildingName, floorName);
              const usedSlugs = new Set();

              for (const room of floorRooms) {
                if (!isCanonicalRoomPageCandidate(room)) {
                  continue;
                }

                const baseSlug = slugifyCanonicalSegment(room.nome);
                if (!baseSlug) {
                  continue;
                }

                let candidateSlug = baseSlug;
                let index = 2;
                while (usedSlugs.has(candidateSlug)) {
                  candidateSlug = `${baseSlug}-${index}`;
                  index += 1;
                }
                usedSlugs.add(candidateSlug);

                if ((detailId && room.id && room.id === detailId) || (detailSlug && candidateSlug === detailSlug)) {
                  return {
                    polo: poloName,
                    edificio: buildingName,
                    piano: floorName,
                    room
                  };
                }
              }

              if (detailId) {
                return findRoomById(poloName, buildingName, floorName, detailId);
              }

              return null;
            }

            function markProgrammaticMapChange() {
                programmaticMapChange = true;
                if (programmaticMapChangeResetTimeout) {
                    clearTimeout(programmaticMapChangeResetTimeout);
                }
                // Aumentato a 2000ms per coprire l'animationTime di 1.5s su mobile
                programmaticMapChangeResetTimeout = setTimeout(() => {
                    programmaticMapChange = false;
                    programmaticMapChangeResetTimeout = null;
                }, 2000);
            }

            function clearProgrammaticMapChangeFlag() {
                programmaticMapChange = false;
                if (programmaticMapChangeResetTimeout) {
                    clearTimeout(programmaticMapChangeResetTimeout);
                    programmaticMapChangeResetTimeout = null;
                }
            }

            function normalizeShortCode(value) {
                return value ? value.toString().trim().toLowerCase().replace(/\s+/g, '') : '';
            }

            function getRoomBaseShortCode(room) {
                if (!room) return null;
                // For persons, use the RICERCA field (Cognome Nome) as the short code
                if (room.type === 'persona' && room.ricerca) {
                    return normalizeShortCode(room.ricerca);
                }

                if (Array.isArray(room.alias)) {
                    const validAlias = room.alias.find(alias => alias && alias.trim().length > 0);
                    if (validAlias) {
                        return normalizeShortCode(validAlias);
                    }
                }
                if (room.nome && room.nome.trim().length > 0) {
                    return normalizeShortCode(room.nome);
                }
                if (room.id && room.id.trim().length > 0) {
                    return normalizeShortCode(room.id);
                }
                return null;
            }

            function getAllRoomsInPolo(poloName) {
                if (!data.polo || !data.polo[poloName]) return [];

                const allRooms = [];
                const buildings = data.polo[poloName].edificio || {};

                // Sort buildings to ensure deterministic order
                const sortedBuildingNames = Object.keys(buildings).sort();

                for (const buildingName of sortedBuildingNames) {
                    const building = buildings[buildingName];
                    const floors = building.piano || {};
                    // Sort floors to ensure deterministic order
                    const sortedFloorNames = Object.keys(floors).sort((a, b) => {
                        // Try numeric sort first
                        const numA = parseFloat(a);
                        const numB = parseFloat(b);
                        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                        return a.localeCompare(b);
                    });

                    for (const floorName of sortedFloorNames) {
                        const floorData = floors[floorName];
                        const rooms = Array.isArray(floorData)
                            ? floorData
                            : (floorData?.aule ? Object.values(floorData.aule) : []);

                        // Filter out non-room items (dispensers) to prevent errors and irrelevant short codes
                        // Keep 'persona' type so people can be found via short links
                        const filteredRooms = rooms.filter(r => r.type !== 'erogatore_acqua');

                        // Sort rooms by name to ensure deterministic order
                        const sortedRooms = [...filteredRooms].sort((a, b) => {
                            const nameA = a.nome || '';
                            const nameB = b.nome || '';
                            const strA = typeof nameA === 'string' ? nameA : String(nameA);
                            const strB = typeof nameB === 'string' ? nameB : String(nameB);
                            return strA.localeCompare(strB);
                        });

                        for (const room of sortedRooms) {
                            if (room) {
                                allRooms.push({
                                    edificio: buildingName,
                                    piano: floorName,
                                    room
                                });
                            }
                        }
                    }
                }
                return allRooms;
            }

            function generateRobustShortCode(poloName, targetRoom) {
                const baseCode = getRoomBaseShortCode(targetRoom);
                if (!baseCode) return null;

                // Optimization removed: Names might collide, so we need to check collisions for everyone.
                // if (targetRoom.type === 'persona') { ... }

                const allRooms = getAllRoomsInPolo(poloName);

                // Find all rooms that share the same base code
                const conflictingRooms = allRooms.filter(item => {
                    const otherBaseCode = getRoomBaseShortCode(item.room);
                    return otherBaseCode === baseCode;
                });

                if (conflictingRooms.length <= 1) {
                    return baseCode;
                }

                // Find index of our target room in the conflicting list
                // We use object reference equality since we're iterating the same data structure
                const index = conflictingRooms.findIndex(item => item.room === targetRoom);

                if (index === 0) {
                    return baseCode;
                } else if (index > 0) {
                    return `${baseCode}-${index + 1}`;
                }

                return baseCode; // Fallback
            }

            function setShortLinkContext({ polo, building, floor, room, codeOverride = null }) {
                if (!isRoomEligibleForShortLink(room)) {
                    shortLinkContext = null;
                    return;
                }

                let resolvedCode = codeOverride && codeOverride.trim();

                if (!resolvedCode) {
                    // Use precalculated code if available (O(1)), otherwise fallback to robust generation (O(N))
                    if (room.calculatedShortCode) {
                        resolvedCode = room.calculatedShortCode;
                    } else {
                        resolvedCode = generateRobustShortCode(polo, room);
                    }
                }

                if (!resolvedCode) {
                    shortLinkContext = null;
                    return;
                }

                shortLinkContext = {
                    polo,
                    building,
                    floor,
                  code: resolvedCode,
                  roomName: room.nome || room.ricerca || null,
                  queryBasePath: buildCanonicalFloorPath(polo, building, floor),
                  canonicalPath: buildCanonicalRoomPath(polo, building, floor, room),
                  canonicalRoomPage: isCanonicalRoomPageCandidate(room),
                  isPerson: getRoomTypes(room).has('persona')
                };
            }

            function clearShortLinkContext() {
                if (shortLinkContext) {
                    shortLinkContext = null;
                }
            }

              function setCanonicalContextOverride({ pageType, polo, building = null, floor = null, path = null }) {
                canonicalContextOverride = path ? { pageType, polo, building, floor, path } : null;
              }

              function clearCanonicalContextOverride() {
                canonicalContextOverride = null;
              }

              function getCanonicalContextOverridePath() {
                if (!canonicalContextOverride?.path) return null;
                if (canonicalContextOverride.polo !== selectedPolo) return null;
                if (canonicalContextOverride.pageType === 'polo') return canonicalContextOverride.path;
                if (canonicalContextOverride.building !== selectedBuilding) return null;
                if (canonicalContextOverride.pageType === 'building') return canonicalContextOverride.path;
                if (canonicalContextOverride.pageType === 'floor' && canonicalContextOverride.floor === selectedFloor) {
                  return canonicalContextOverride.path;
                }
                return null;
              }

            const hideSearchResultsPanels = () => {
                // Check if we should keep the promo visible
                const currentSearchResults = isMobile() ? searchResultsMobile : searchResults;
                const searchInputEl = isMobile() ? searchInputMobile : searchInput;
                const isPromoFn = (el) => el && el.innerHTML.includes('type: "bot_promo"') || (el && el.innerHTML.includes('bot_promo')); // Rough check due to innerHTML structure
                // Actually check the DOM element class or dataset
                
                // Let's refine: We only hide if it's NOT the empty-state promo
                // Or if the user really wants to hide it?
                // The user said: "voglio che me lo mostri anche quando apro la pagina nel senso sempre quando il field è vuoto"
                // This implies it should act like a default state rather than a transient search result.
                
                // However, hiding it when clicking on the map is standard behavior.
                // If I click on the map to pan/zoom, I might want to see the full map.
                // But the search panel overlays.
                // If the user insists "always", I should respect that condition:
                // "always when the field is empty"
                
                if (searchInputEl && searchInputEl.value.trim() === '') {
                     const isPromoDismissed = localStorage.getItem('bot_v2_promo_dismissed') === 'true';
                     if (!isPromoDismissed) {
                         // Don't hide
                         return;
                     }
                }

                if (searchResults) {
                    searchResults.classList.add('hidden');
                }
                if (searchResultsMobile) {
                    searchResultsMobile.classList.add('hidden');
                }
                stopOccupancyRefreshLoop();
            };

            function registerViewerInteractionGuards() {
                if (viewerInteractionGuardsInstalled || !viewer) return;

              viewer.addHandler('canvas-drag', () => {
                if (!programmaticMapChange) {
                  clearShortLinkContext();
                }
                });

                viewer.addHandler('zoom', (event) => {
                    // OpenSeadragon fires zoom events frequently during animation
                    // We only want to clear context if it's a user interaction
                    if (!programmaticMapChange && event.refPoint) {
                        clearShortLinkContext();
                    }
                });

                let updateUrlTimer;
                const debouncedUpdateUrl = () => {
                    if (updateUrlTimer) clearTimeout(updateUrlTimer);
                    updateUrlTimer = setTimeout(() => {
                        updateURL(true);
                    }, 100);
                };

                viewer.addHandler('animation-finish', () => {
                    clearProgrammaticMapChangeFlag();
                    debouncedUpdateUrl();
                });

                viewerInteractionGuardsInstalled = true;
            }

            function updateClearButtonsVisibility() {
                if (clearSearchBtn) {
                    const hasValue = Boolean(searchInput && searchInput.value && searchInput.value.trim().length);
                    clearSearchBtn.classList.toggle('hidden', !hasValue);
                }
                if (clearSearchBtnMobile) {
                    const hasValueMobile = Boolean(searchInputMobile && searchInputMobile.value && searchInputMobile.value.trim().length);
                    clearSearchBtnMobile.classList.toggle('hidden', !hasValueMobile);
                }
            }

            // Funzione per aggiornare il placeholder
            function updateSearchPlaceholder() {
                // Se abbiamo pochi suggerimenti, usa il comportamento ciclico semplice per evitare loop infiniti
                if (searchSuggestions.length <= 2) {
                    currentSuggestionIndex = (currentSuggestionIndex + 1) % searchSuggestions.length;
                } else {
                    // Seleziona un indice casuale tra 1 e length-1 (escludendo 0 che è il default)
                    // Assicura che non si ripeta lo stesso suggerimento due volte di fila
                    let newIndex;
                    do {
                        newIndex = Math.floor(Math.random() * (searchSuggestions.length - 1)) + 1;
                    } while (newIndex === currentSuggestionIndex);
                    currentSuggestionIndex = newIndex;
                }

                const newPlaceholder = searchSuggestions[currentSuggestionIndex];
                if (searchInput) searchInput.placeholder = newPlaceholder;
                if (searchInputMobile) searchInputMobile.placeholder = newPlaceholder;
            }

            // Funzione per avviare il ciclo dei suggerimenti
            function startSearchPlaceholderCycle() {
                if (searchPlaceholderInterval) {
                    clearInterval(searchPlaceholderInterval);
                }
                searchPlaceholderInterval = setInterval(updateSearchPlaceholder, 5000);
            }

            // Nuova funzione per centrare la mappa su un'aula senza ricaricare
            function centerMapOnRoom(room) {
                if (!room || !room.coordinates || room.coordinates.x == null || room.coordinates.y == null) {
                    return false; // Nessuna coordinata disponibile
                }

                if (!viewer) {
                    return false; // Mappa non ancora inizializzata
                }

                const tiledImage = viewer.world.getItemAt(0);
                if (!tiledImage) return false;

                const contentSize = tiledImage.getContentSize();
                // Convert Leaflet Y (bottom-up) to OSD Y (top-down)
                const osdY = contentSize.y - parseFloat(room.coordinates.y);
                const osdX = parseFloat(room.coordinates.x);

                const imagePoint = new OpenSeadragon.Point(osdX, osdY);
                const viewportPoint = tiledImage.imageToViewportCoordinates(imagePoint);

                // Map Leaflet zoom to OSD Image Zoom (magnification) for consistency across devices
                const zoom = room.coordinates.zoom != null ? parseFloat(room.coordinates.zoom) : 2;
                // Convert Image Zoom to Viewport Zoom
                const viewportZoom = tiledImage.imageToViewportZoom(zoom);

                markProgrammaticMapChange();
                viewer.viewport.panTo(viewportPoint);
                viewer.viewport.zoomTo(viewportZoom);
                
                // Add Apple Maps style marker
                addSelectedRoomMarker(room, viewportPoint);

                return true;
            }

            let currentSelectedRoomOverlay = null;

            function clearSelectedRoomMarker() {
                if (!viewer) return;
                if (currentSelectedRoomOverlay) {
                    viewer.removeOverlay(currentSelectedRoomOverlay);
                    currentSelectedRoomOverlay = null;
                }
                const mapContainer = document.getElementById('map');
                if (mapContainer) {
                    const hiddenPOIs = mapContainer.querySelectorAll('.poi-hidden-for-selection');
                    hiddenPOIs.forEach(poi => {
                        poi.style.opacity = '1';
                        poi.classList.remove('poi-hidden-for-selection');
                    });
                }
            }

            function addSelectedRoomMarker(room, viewportPoint) {
                if (!viewer || !room) return;
                
                clearSelectedRoomMarker();
                
                const mapContainer = document.getElementById('map');
                if (mapContainer) {
                    const roomNameSearch = (room.nome || room.ricerca || '').toLowerCase();
                    const allMarkers = mapContainer.querySelectorAll('[data-marker-type], .water-dispenser-marker, .study-room-marker');
                    allMarkers.forEach(marker => {
                        const markerRoomName = (marker.getAttribute('data-room-name') || '').toLowerCase();
                        if (markerRoomName === roomNameSearch) {
                            marker.style.opacity = '0';
                            marker.classList.add('poi-hidden-for-selection');
                        }
                    });
                }
                
                const element = document.createElement('div');
                element.className = 'apple-maps-dot counter-rotate-marker';
                
                viewer.addOverlay({
                    element: element,
                    location: viewportPoint,
                    placement: 'CENTER'
                });
                
                currentSelectedRoomOverlay = element;
            }

            // Nuova funzione per selezionare un'aula senza ricaricare la mappa
            function selectRoom(polo, edificio, piano, room) {
                const eligibleForShortLink = isRoomEligibleForShortLink(room);
                if (eligibleForShortLink) {
                    const contextParams = { polo, building: edificio, floor: piano, room };
                    // We no longer need codeOverride for persons, as their ID is their short code now.
                    setShortLinkContext(contextParams);
                } else {
                    clearShortLinkContext();
                }

                // Verifica se siamo già sul piano corretto
                const isSameLocation = (
                    selectedPolo === polo &&
                    selectedBuilding === edificio &&
                    selectedFloor === piano
                );

                if (isSameLocation) {
                    // Siamo già sul piano giusto, centra la mappa
                    centerMapOnRoom(room);
                    if (eligibleForShortLink) {
                        updateURL(true);
                    }
                } else {
                    // Cambio di piano necessario, ricarica la mappa in vista top con le coordinate dell'aula
                    selectPolo(polo, edificio, piano, null, 'top', room);
                }

                if (settingsConfig.copyLinkOnSelect && eligibleForShortLink) {
                    setTimeout(() => {
                        navigator.clipboard.writeText(window.location.href).then(() => {
                            const sb = document.getElementById('share-btn');
                            if (sb && typeof isTouchDevice === 'function' && !isTouchDevice()) {
                                const originalTooltip = sb.getAttribute('data-tooltip');
                                sb.setAttribute('data-tooltip', t('share_link_copied'));
                                showTooltip({
                                    currentTarget: sb
                                });
                                setTimeout(() => {
                                    sb.setAttribute('data-tooltip', originalTooltip);
                                    hideTooltip();
                                }, 2000);
                            }
                        }).catch(err => {
                            console.error('Auto-copy failed:', err);
                        });
                    }, 50);
                }
            }

            function parseCapacityQuery(rawQuery) {
                const trimmed = rawQuery.trim();
                const match = trimmed.match(/^(>=|<=|>|<|==|=|!=)\s*(\d+)$/);
                if (!match) {
                    return null;
                }
                const operator = match[1] === '=' ? '==' : match[1];
                const value = parseInt(match[2], 10);
                if (Number.isNaN(value)) {
                    return null;
                }
                return { operator, value };
            }

            function matchesCapacity(capienza, filter) {
                const capacityValue = typeof capienza === 'number' ? capienza : parseInt(capienza, 10);
                if (Number.isNaN(capacityValue)) {
                    return false;
                }
                switch (filter.operator) {
                    case '>':
                        return capacityValue > filter.value;
                    case '>=':
                        return capacityValue >= filter.value;
                    case '<':
                        return capacityValue < filter.value;
                    case '<=':
                        return capacityValue <= filter.value;
                    case '!=':
                        return capacityValue !== filter.value;
                    case '==':
                        return capacityValue === filter.value;
                    default:
                        return false;
                }
            }

            // Funzione per la ricerca
            function searchRooms(query = '') {
                updateClearButtonsVisibility();
                const currentSearchResults = isMobile() ? searchResultsMobile : searchResults;

                if (!query) {
                    const isPromoDismissed = localStorage.getItem('bot_v2_promo_dismissed') === 'true';
                    
                    if (!isPromoDismissed) {
                         const promoResult = {
                            type: 'bot_promo',
                            title: t('open_telegram_bot_v2'),
                            details: t('bot_details'),
                            url: 'https://t.me/doveunipibot'
                        };
                        displaySearchResults([promoResult]);
                        currentSearchResults.classList.remove('hidden');
                        selectedSearchResultIndex = -1;
                        document.body.classList.remove('keyboard-navigation-active');
                        return;
                    }

                    currentSearchResults.innerHTML = '';
                    hideSearchResultsPanels();
                    selectedSearchResultIndex = -1;
                    document.body.classList.remove('keyboard-navigation-active');
                    return;
                }

                // Check if query is wrapped in quotes for exact search
                let queryLower = query.toLowerCase();
                let isExactSearch = false;

                if ((queryLower.startsWith('"') && queryLower.endsWith('"')) ||
                    (queryLower.startsWith('"') && queryLower.endsWith('"'))) {
                    // Remove quotes and mark as exact search
                    queryLower = queryLower.slice(1, -1).trim();
                    isExactSearch = true;
                }
                const matchesSettingsQuery = queryLower.includes('impostazioni') || queryLower.includes('settings');
                const matchesShareQuery = queryLower.includes('share') || queryLower.includes('condivid') || queryLower.includes('github') || queryLower.includes('instagram');
                const feedbackKeywords = ['feedback', 'help', 'aiuto', 'suggerimento', 'proposta', 'issue', 'segnalazione'];
                const matchesFeedbackQuery = feedbackKeywords.some(kw => queryLower.includes(kw));
                const matchesBotQuery = queryLower.includes('bot') || queryLower.includes('telegram');
                const capacityFilter = parseCapacityQuery(query);
                const results = [];
                const peopleMatches = [];

                // Suggerimenti di autocompletamento per parole chiave speciali
                const specialKeywords = [
                    { keywords: ['impostazioni', 'settings', 'setting', 'impostazione', 'config'], type: 'settings', title: t('settings_title'), details: t('search_suggestion_settings_hint') },
                    { keywords: ['share', 'condivid', 'condivisione'], type: 'share_suggestion', title: t('share_aria_label'), details: t('search_suggestion_share_hint') },
                    { keywords: ['feedback', 'feedbac', 'feed', 'help', 'aiuto', 'propost', 'suggeriment'], type: 'feedback_suggestion', title: 'Feedback', details: t('search_suggestion_feedback_hint') },
                    { keywords: ['bot', 'telegram'], type: 'bot_suggestion', title: t('bot_title'), details: t('search_suggestion_bot_hint') }
                ];

                // Controlla se la query corrisponde parzialmente a una parola chiave
                // Mostra suggerimenti solo se la query è abbastanza corta e non matcha già completamente
                const shouldShowSuggestions = queryLower.length >= 2 && queryLower.length <= 10 &&
                    !matchesSettingsQuery && !matchesShareQuery && !matchesFeedbackQuery && !matchesBotQuery;

                if (shouldShowSuggestions) {
                    for (const keyword of specialKeywords) {
                        const partialMatch = keyword.keywords.some(kw =>
                            kw.startsWith(queryLower) && kw !== queryLower
                        );

                        if (partialMatch) {
                            results.push({
                                type: keyword.type,
                                title: keyword.title,
                                details: keyword.details,
                                suggestion: true
                            });
                            break; // Mostra solo il primo suggerimento che matcha
                        }
                    }
                }

                if (matchesBotQuery) {
                    results.push({
                        type: 'bot',
                        title: t('bot_title'),
                        details: t('bot_details'),
                        action: 'link',
                        url: 'https://t.me/doveunipibot'
                    });
                }

                if (matchesFeedbackQuery) {
                    results.push(
                        {
                            type: 'feedback',
                            title: t('feedback_email_title'),
                            details: t('feedback_email_details'),
                            action: 'email'
                        },
                        {
                            type: 'feedback',
                            title: t('feedback_github_title'),
                            details: t('feedback_github_details'),
                            action: 'github'
                        }
                    );
                }

                if (matchesShareQuery) {
                    results.push(
                        {
                            type: 'share',
                            title: t('share_page_title'),
                            details: t('share_page_details'),
                            url: 'https://plumkewe.github.io/dove-unipi/'
                        },
                        {
                            type: 'share',
                            title: t('share_github_title'),
                            details: t('share_github_details'),
                            url: 'https://github.com/plumkewe/dove-unipi'
                        },
                        {
                            type: 'share',
                            title: t('share_instagram_title'),
                            details: t('share_instagram_details'),
                            url: 'https://www.instagram.com/doveunipi/'
                        },
                        {
                            type: 'share',
                            title: t('share_telegram_title'),
                            details: t('share_telegram_details'),
                            url: 'https://t.me/doveunipibot'
                        }
                    );
                }

                // Cerca nei poli
                for (const poloName in data.polo) {
                    const polo = data.polo[poloName];

                    if (poloName.toLowerCase() === 'ingegneria') {
                        if (polo.edificio) {
                            for (const bName in polo.edificio) {
                                const b = polo.edificio[bName];
                                
                                const defaultTitle = (b.alias && b.alias.length > 0) ? b.alias[0] : ("Polo " + bName.toUpperCase());
                                let matchedTitle = defaultTitle;
                                let matches = false;
                                
                                const namesToSearch = (b.alternative_names || []).map(a => ({ text: a, display: a }));

                                for (const item of namesToSearch) {
                                    const textLower = item.text.toLowerCase();
                                    const isMatch = isExactSearch ? (textLower === queryLower) : (textLower.includes(queryLower));
                                    if (isMatch) {
                                        matches = true;
                                        matchedTitle = item.display;
                                        break;
                                    }
                                }

                                if (matches) {
                                    results.push({
                                        type: 'polo_result',
                                        polo: poloName,
                                        edificio: bName,
                                        title: matchedTitle,
                                        address: b.address || '',
                                        google_maps: b.google_maps || ''
                                    });
                                }
                            }
                        }
                    } else {
                        const defaultTitle = "Polo " + poloName.charAt(0).toUpperCase() + poloName.slice(1);
                        let matchedTitle = defaultTitle;
                        let matches = false;
                        
                        const namesToSearch = (polo.alternative_names || []).map(a => ({ text: a, display: a }));

                        for (const item of namesToSearch) {
                            const textLower = item.text.toLowerCase();
                            const isMatch = isExactSearch ? (textLower === queryLower) : (textLower.includes(queryLower));
                            if (isMatch) {
                                matches = true;
                                matchedTitle = item.display;
                                break;
                            }
                        }

                        if (matches && polo.address) {
                            results.push({
                                type: 'polo_result',
                                polo: poloName,
                                title: matchedTitle,
                                address: polo.address || '',
                                google_maps: polo.google_maps || ''
                            });
                        }
                    }
                }

                // Cerca nelle aule
                for (const poloName in data.polo) {
                    const polo = data.polo[poloName];
                    for (const buildingName in polo.edificio) {
                        const building = polo.edificio[buildingName];

                        // Cerca nei dipartimenti definiti a livello di edificio
                        if (building.dipartimenti && Array.isArray(building.dipartimenti)) {
                            building.dipartimenti.forEach(dept => {
                                const ricercaLower = (dept.ricerca || '').toLowerCase();
                                const aliasLower = Array.isArray(dept.alias) ? dept.alias.map(a => a.toLowerCase()) : [];

                                const matches = isExactSearch
                                    ? (ricercaLower === queryLower || aliasLower.some(a => a === queryLower))
                                    : (ricercaLower.includes(queryLower) || aliasLower.some(a => a.includes(queryLower)));

                                if (matches) {
                                    results.push({
                                        polo: poloName,
                                        edificio: buildingName,
                                        piano: "0", // Default floor for building-level departments
                                        room: dept
                                    });
                                }
                            });
                        }

                        for (const floorName in building.piano) {
                            const items = building.piano[floorName];
                            if (Array.isArray(items)) {
                                items.forEach(item => {
                                    // 1. Check for Rooms (Aule, Studi, etc)
                                    if (!['persona', 'erogatore_acqua'].includes(item.type)) {
                                        if (capacityFilter) {
                                            if (matchesCapacity(item.capienza, capacityFilter)) {
                                                results.push({
                                                    polo: poloName,
                                                    edificio: buildingName,
                                                    piano: floorName,
                                                    room: item
                                                });
                                            }
                                            return;
                                        }

                                        const ricercaLower = (item.ricerca || '').toLowerCase();
                                        const aliasLower = Array.isArray(item.alias) ? item.alias.map(a => a.toLowerCase()) : [];

                                        const matches = isExactSearch
                                            ? (ricercaLower === queryLower || aliasLower.some(a => a === queryLower))
                                            : (ricercaLower.includes(queryLower) || aliasLower.some(a => a.includes(queryLower)));

                                        if (matches) {
                                            results.push({
                                                polo: poloName,
                                                edificio: buildingName,
                                                piano: floorName,
                                                room: item
                                            });
                                        }
                                    }
                                    // 2. Check for Facilities (Erogatori)
                                    else if (item.type === 'erogatore_acqua' && settingsConfig.showWaterDispensers) {
                                        const ricercaLower = (item.ricerca || '').toLowerCase();
                                        const aliasLower = Array.isArray(item.alias) ? item.alias.map(a => a.toLowerCase()) : [];

                                        const matches = isExactSearch
                                            ? (ricercaLower === queryLower || aliasLower.some(a => a === queryLower))
                                            : (ricercaLower.includes(queryLower) || aliasLower.some(a => a.includes(queryLower)));

                                        if (matches) {
                                            results.push({
                                                polo: poloName,
                                                edificio: buildingName,
                                                piano: floorName,
                                                room: item,
                                                isFacility: true
                                            });
                                        }
                                    }
                                    // 3. Check for People
                                    else if (item.type === 'persona') {
                                        const ricercaLower = (item.ricerca || '').toLowerCase();
                                        const aliasLower = Array.isArray(item.alias) ? item.alias.map(a => a.toLowerCase()) : [];
                                        
                                        const matches = isExactSearch
                                            ? (ricercaLower === queryLower || aliasLower.some(a => a === queryLower))
                                            : (ricercaLower.includes(queryLower) || aliasLower.some(a => a.includes(queryLower)));

                                        if (matches) {
                                            peopleMatches.push({
                                                polo: poloName,
                                                edificio: buildingName,
                                                piano: floorName,
                                                room: item,
                                                isPerson: true
                                            });
                                        }
                                    }
                                });
                            }
                        }
                    }
                }

                // Ordina i risultati: priorità per prossimità al polo/edificio/piano corrente
                if (results.length > 0) {
                    // Funzione di prossimità unificata per tutti i risultati delle aule
                    const getProximityScore = (item) => {
                        if (!item.polo) return 4; // risultati speciali (settings, share, etc.)
                        if (item.polo === selectedPolo && item.edificio === selectedBuilding && item.piano === selectedFloor) return 0;
                        if (item.polo === selectedPolo && item.edificio === selectedBuilding) return 1;
                        if (item.polo === selectedPolo) return 2;
                        return 3;
                    };

                    results.sort((a, b) => {
                        // I risultati speciali (senza polo) restano in cima
                        const aIsSpecial = !a.polo;
                        const bIsSpecial = !b.polo;
                        if (aIsSpecial && !bIsSpecial) return -1;
                        if (!aIsSpecial && bIsSpecial) return 1;
                        if (aIsSpecial && bIsSpecial) return 0;

                        // Priorità per prossimità (stesso piano > stesso edificio > stesso polo > altro polo)
                        const scoreA = getProximityScore(a);
                        const scoreB = getProximityScore(b);
                        if (scoreA !== scoreB) return scoreA - scoreB;

                        // Per ricerca di capienza, ordina per capienza decrescente
                        if (capacityFilter) {
                            const capA = a.room?.capienza || 0;
                            const capB = b.room?.capienza || 0;
                            if (capA !== capB) return capB - capA;
                        }

                        const aRicerca = (a.room?.ricerca || '').toLowerCase();
                        const bRicerca = (b.room?.ricerca || '').toLowerCase();

                        // Per ricerca testuale: priorità a chi inizia con la query
                        if (!capacityFilter) {
                            const aStartsWith = aRicerca.startsWith(queryLower);
                            const bStartsWith = bRicerca.startsWith(queryLower);
                            if (aStartsWith && !bStartsWith) return -1;
                            if (!aStartsWith && bStartsWith) return 1;
                        }

                        // Ordinamento alfabetico come fallback
                        return aRicerca.localeCompare(bRicerca);
                    });
                }

                // Ordina i risultati delle persone e aggiungili in fondo
                if (peopleMatches.length > 0) {
                    peopleMatches.sort((a, b) => {
                        // Priorità per polo corrente
                        const aIsCurrentPolo = a.polo === selectedPolo;
                        const bIsCurrentPolo = b.polo === selectedPolo;
                        if (aIsCurrentPolo && !bIsCurrentPolo) return -1;
                        if (!aIsCurrentPolo && bIsCurrentPolo) return 1;

                        const aRicerca = (a.room.ricerca || '').toLowerCase();
                        const bRicerca = (b.room.ricerca || '').toLowerCase();

                        // Controlla se la ricerca inizia con la query
                        const aStartsWith = aRicerca.startsWith(queryLower);
                        const bStartsWith = bRicerca.startsWith(queryLower);

                        // 1. Priorità massima: inizia con la query
                        if (aStartsWith && !bStartsWith) return -1;
                        if (!aStartsWith && bStartsWith) return 1;

                        // 2. Alfabeticamente
                        return aRicerca.localeCompare(bRicerca);
                    });

                    results.push(...peopleMatches);
                }

                // Cerca nelle biblioteche esterne (biblioteche.json) non presenti su DOVE?UNIPI
                if (biblioteche.length > 0 && !capacityFilter) {
                    // Raccogli gli id già presenti in unified.json (biblioteche già mappate)
                    const unifiedLibraryIds = new Set();
                    for (const poloName in data.polo) {
                        const polo = data.polo[poloName];
                        for (const buildingName in polo.edificio) {
                            const building = polo.edificio[buildingName];
                            for (const floorName in (building.piano || {})) {
                                const items = building.piano[floorName];
                                if (Array.isArray(items)) {
                                    items.forEach(item => {
                                        const isLib = Array.isArray(item.type) ? item.type.includes('biblioteca') : item.type === 'biblioteca';
                                        if (isLib && item.id) unifiedLibraryIds.add(item.id);
                                    });
                                }
                            }
                        }
                    }

                    const externalLibMatches = [];
                    biblioteche.forEach(bib => {
                        // Salta le biblioteche già presenti in unified.json (stesso id)
                        if (bib.id && unifiedLibraryIds.has(bib.id)) return;

                        const ricercaLower = (bib.ricerca || bib.nome || '').toLowerCase();
                        const aliasLower = Array.isArray(bib.alias) ? bib.alias.map(a => a.toLowerCase()) : [];
                        const nomeLower = (bib.nome || '').toLowerCase();

                        const matches = isExactSearch
                            ? (ricercaLower === queryLower || nomeLower === queryLower || aliasLower.some(a => a === queryLower))
                            : (ricercaLower.includes(queryLower) || nomeLower.includes(queryLower) || aliasLower.some(a => a.includes(queryLower)));

                        if (matches) {
                            externalLibMatches.push({
                                type: 'external_library',
                                room: bib
                            });
                        }
                    });

                    // Ordina alfabeticamente
                    externalLibMatches.sort((a, b) => {
                        const aName = (a.room.ricerca || a.room.nome || '').toLowerCase();
                        const bName = (b.room.ricerca || b.room.nome || '').toLowerCase();
                        const aStarts = aName.startsWith(queryLower);
                        const bStarts = bName.startsWith(queryLower);
                        if (aStarts && !bStarts) return -1;
                        if (!aStarts && bStarts) return 1;
                        return aName.localeCompare(bName);
                    });

                    results.push(...externalLibMatches);
                }

                displaySearchResults(results, matchesSettingsQuery);
            }

            // In-flight library fetch deduplication: nid → Promise<data>
            const libraryFetchInFlight = {};

            function fetchLibrarySchedule(nid, container) {
                const today = new Date();
                const yyyy = today.getFullYear();
                const mm = String(today.getMonth() + 1).padStart(2, '0');
                const dd = String(today.getDate()).padStart(2, '0');
                const fromDate = `${yyyy}-${mm}-${dd}`;

                // Helper to find live container
                const getLiveContainer = () => {
                    const liveStatusBar = document.querySelector(`.occupancy-status-bar[data-library-nid="${nid}"]`);
                    return liveStatusBar ? liveStatusBar.closest('.search-result-item') : container;
                };

                // Check cache
                const cacheKey = `library_schedule_${nid}`;
                try {
                    const cachedData = localStorage.getItem(cacheKey);
                    if (cachedData) {
                        const parsed = JSON.parse(cachedData);
                        if (parsed.date === fromDate && parsed.data) {
                            updateLibraryUI(getLiveContainer(), parsed.data);
                            return;
                        }
                    }
                } catch (e) {
                    console.warn('Error reading library cache:', e);
                }

                // If already fetching this nid, attach to the existing promise
                if (libraryFetchInFlight[nid]) {
                    libraryFetchInFlight[nid]
                        .then(data => updateLibraryUI(getLiveContainer(), data))
                        .catch(() => updateLibraryUI(getLiveContainer(), null, true));
                    return;
                }

                const nextWeek = new Date(today);
                nextWeek.setDate(today.getDate() + 6);
                const yyyy2 = nextWeek.getFullYear();
                const mm2 = String(nextWeek.getMonth() + 1).padStart(2, '0');
                const dd2 = String(nextWeek.getDate()).padStart(2, '0');
                const toDate = `${yyyy2}-${mm2}-${dd2}`;

                const directUrl = `https://www.sba.unipi.it/it/opening_hours/instances?from_date=${fromDate}&to_date=${toDate}&nid=${nid}`;
                const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(directUrl)}`;

                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), 8000);
                const fetchPromise = fetch(proxyUrl, { signal: controller.signal })
                    .finally(() => clearTimeout(timer))
                    .then(response => {
                        if (!response.ok) throw new Error(`HTTP ${response.status}`);
                        return response.json();
                    });

                libraryFetchInFlight[nid] = fetchPromise;

                fetchPromise
                    .then(data => {
                        delete libraryFetchInFlight[nid];
                        try {
                            localStorage.setItem(cacheKey, JSON.stringify({ date: fromDate, data }));
                        } catch (e) {
                            console.warn('Error saving library cache:', e);
                        }
                        updateLibraryUI(getLiveContainer(), data);
                    })
                    .catch(err => {
                        delete libraryFetchInFlight[nid];
                        console.error('Library fetch failed:', err);
                        updateLibraryUI(getLiveContainer(), null, true);
                    });
            }

            function updateLibraryUI(container, data, isError = false) {
                const statusBar = container.querySelector('.occupancy-status-bar');
                const statusText = container.querySelector('.occupancy-text');
                const detailsContent = container.querySelector('.occupancy-details-content');

                if (!statusBar || !statusText || !detailsContent) return;

                statusBar.classList.remove('loading');

                if (isError || !data) {
                    // Show unavailable state instead of hiding completely
                    statusBar.classList.add('occupied');
                    statusText.textContent = t('availability_unavailable');
                    return;
                }

                // Create and add expand icon with click handler (only after data is successfully loaded)
                const libraryNid = statusBar.getAttribute('data-library-nid');
                const occupancyId = `library-schedule-${libraryNid}`;

                // Check if icon doesn't already exist (to avoid duplicates on cache hits)
                let expandIcon = statusBar.querySelector('.occupancy-expand-icon');
                if (!expandIcon) {
                    expandIcon = document.createElement('span');
                    expandIcon.className = 'occupancy-expand-icon material-symbols-outlined';
                    expandIcon.setAttribute('data-occupancy-id', occupancyId);
                    expandIcon.textContent = 'keyboard_arrow_down';
                    statusBar.appendChild(expandIcon);

                    // Add click handler
                    statusBar.style.cursor = 'pointer';
                    statusBar.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const detailsElement = document.getElementById(occupancyId);
                        if (detailsElement) {
                            detailsElement.classList.toggle('expanded');
                            expandIcon.classList.toggle('expanded');
                        }
                    });
                }

                // Helper to format date as YYYY-MM-DD in local time
                const formatDateLocal = (date) => {
                    const yyyy = date.getFullYear();
                    const mm = String(date.getMonth() + 1).padStart(2, '0');
                    const dd = String(date.getDate()).padStart(2, '0');
                    return `${yyyy}-${mm}-${dd}`;
                };

                // 1. Determine current status
                const now = new Date();
                const todayStr = formatDateLocal(now);
                const todayEntry = data.find(d => d.date === todayStr);

                let currentStatusText = t('Closed');
                let colorClass = 'occupied'; // Red for closed

                if (todayEntry) {
                    const currentHours = String(now.getHours()).padStart(2, '0');
                    const currentMinutes = String(now.getMinutes()).padStart(2, '0');
                    const currentTime = `${currentHours}:${currentMinutes}`;
                    const startTime = todayEntry.start_time.trim().substring(0, 5);
                    const endTime = todayEntry.end_time.trim().substring(0, 5);

                    if (currentTime < startTime) {
                        currentStatusText = `${t('opens_at')} ${startTime}`;
                        colorClass = 'occupied'; // Red
                    } else if (currentTime >= startTime && currentTime < endTime) {
                        currentStatusText = `${t('closes_at')} ${endTime}`;
                        colorClass = 'free'; // Green
                    } else {
                        currentStatusText = t('Closed');
                        colorClass = 'occupied'; // Red
                    }
                } else {
                    currentStatusText = t('Closed');
                    colorClass = 'occupied';
                }

                statusBar.classList.add(colorClass);
                statusText.textContent = currentStatusText;

                // 2. Build weekly schedule HTML
                let scheduleHTML = '<div class="flex flex-col gap-1">';

                for (let i = 0; i < 7; i++) {
                    const d = new Date();
                    d.setDate(d.getDate() + i);
                    const dateStr = formatDateLocal(d);

                    const dayName = d.toLocaleDateString(currentLanguage === 'en' ? 'en-US' : 'it-IT', { weekday: 'long' });
                    const label = dayName.charAt(0).toUpperCase() + dayName.slice(1);

                    const entry = data.find(e => e.date === dateStr);
                    let hoursText = t('Closed');
                    if (entry) {
                        hoursText = `${entry.start_time.trim().substring(0, 5)} - ${entry.end_time.trim().substring(0, 5)}`;
                    }

                    const isToday = i === 0;
                    const rowStyle = isToday ? 'font-weight: bold;' : '';

                    scheduleHTML += `
                        <div class="flex justify-between" style="${rowStyle}">
                            <span>${label}</span>
                            <span>${hoursText}</span>
                        </div>
                    `;
                }
                scheduleHTML += '</div>';

                detailsContent.innerHTML = scheduleHTML;
            }

            function displaySearchResults(results, showSettings = false, loadMore = false) {
                const currentSearchResults = isMobile() ? searchResultsMobile : searchResults;
                const currentSearchInput = isMobile() ? searchInputMobile : searchInput;

                const wasHidden = currentSearchResults.classList.contains('hidden');
                const oldHeight = (!wasHidden && !loadMore) ? currentSearchResults.scrollHeight : 0;

                const getResultsMaxHeight = () => {
                    return isMobile() ? Math.floor(window.innerHeight * 0.50) : 240;
                };

                const finalizeAndAnimate = () => {
                    if (!wasHidden && !loadMore) {
                        const maxHeight = getResultsMaxHeight();
                        const startHeight = Math.min(oldHeight, maxHeight);
                        const targetHeight = Math.min(currentSearchResults.scrollHeight, maxHeight);

                        currentSearchResults.style.maxHeight = `${startHeight}px`;
                        currentSearchResults.classList.remove('hidden');
                        currentSearchResults.getBoundingClientRect();

                        requestAnimationFrame(() => {
                            currentSearchResults.style.maxHeight = `${targetHeight}px`;
                        });

                        setTimeout(() => {
                            currentSearchResults.style.maxHeight = '';
                        }, isMobile() ? 420 : 340);
                    } else {
                        currentSearchResults.classList.remove('hidden');
                    }
                };

                // Store the current index to preserve it after re-render
                const previousIndex = selectedSearchResultIndex;

                // If not loading more, reset the state and clear results
                if (!loadMore) {
                    allSearchResults = results;
                    currentResultsShown = 0;
                    currentSearchResults.innerHTML = '';
                } else {
                    // When loading more, remove the old notification/load more button
                    const oldNotification = currentSearchResults.querySelector('.load-more-container');
                    if (oldNotification) {
                        oldNotification.remove();
                    }
                }

                // Use DocumentFragment to minimize reflows
                const fragment = document.createDocumentFragment();

                if (showSettings && !loadMore) {
                    // Create a temporary container for settings to append to fragment
                    const settingsContainer = document.createElement('div');
                    renderSettingsBlock(settingsContainer);
                    while (settingsContainer.firstChild) {
                        fragment.appendChild(settingsContainer.firstChild);
                    }

                    if (results.length > 0) {
                        const divider = document.createElement('div');
                        divider.className = 'border-t border-gray-300/70 my-2';
                        fragment.appendChild(divider);
                    }
                }

                if (!showSettings && allSearchResults.length === 0 && !loadMore) {
                    currentSearchResults.innerHTML = `
                        <div class="search-result-item">
                            <div class="flex items-center justify-between">
                            <div class="flex-1">
                                    <div class="title">${t('search_no_results')}</div>
                                    <div class="details">${t('no_results_feedback')}<br />
                                <a href="mailto:lyubomyr.malay@icloud.com?subject=${encodeURIComponent('FEEDBACK DOVE?UNIPI')}" 
                                   class="text-gray-800 underline font-medium hover-text-effect">lyubomyr.malay@icloud.com</a></div>
                               </div>
                             </div>
                        </div>
                    `;
                                        finalizeAndAnimate();
                    selectedSearchResultIndex = -1;
                    document.body.classList.remove('keyboard-navigation-active');
                    return;
                }

                // Limit initial results to prevent DOM blocking
                const MAX_INITIAL_RESULTS = 21;
                const totalResults = allSearchResults.length;
                const startIndex = loadMore ? currentResultsShown : 0;
                const endIndex = Math.min(startIndex + MAX_INITIAL_RESULTS, totalResults);
                const resultsToShow = allSearchResults.slice(startIndex, endIndex);
                currentResultsShown = endIndex;

                // Track if we've inserted the "other poli" divider
                let otherPoliDividerInserted = loadMore ? currentSearchResults.querySelector('.search-results-divider') !== null : false;
                // Track if we've inserted the "Non su DOVE?UNIPI" divider
                let externalLibDividerInserted = loadMore ? currentSearchResults.querySelector('.search-results-divider-external') !== null : false;
                // Track if we've inserted the polo_result section dividers
                let thisPoloDividerInserted = loadMore ? currentSearchResults.querySelector('.search-results-divider-this-polo') !== null : false;
                let otherPoliPoloResultDividerInserted = loadMore ? currentSearchResults.querySelector('.search-results-divider-other-polo') !== null : false;
                // Pre-check: are there polo_results for current AND other polos?
                const hasCurrentPoloResult = allSearchResults.some(r => r.type === 'polo_result' && r.polo === selectedPolo);
                const hasOtherPoloResult = allSearchResults.some(r => r.type === 'polo_result' && r.polo !== selectedPolo);

                resultsToShow.forEach((result, localIndex) => {
                    const globalIndex = startIndex + localIndex; // Calculate global index for event handlers

                    // Insert "Questo polo" divider before the first polo_result from current polo (only when mixed with other polos)
                    if (!thisPoloDividerInserted && result.type === 'polo_result' && result.polo === selectedPolo && hasOtherPoloResult) {
                        const divider = document.createElement('div');
                        divider.className = 'search-results-divider search-results-divider-this-polo';
                        divider.textContent = t('this_polo_divider') || 'Questo polo';
                        fragment.appendChild(divider);
                        thisPoloDividerInserted = true;
                    }

                    // Insert "Altri poli" divider before the first polo_result from another polo
                    if (!otherPoliPoloResultDividerInserted && result.type === 'polo_result' && result.polo !== selectedPolo && selectedPolo) {
                        const divider = document.createElement('div');
                        divider.className = 'search-results-divider search-results-divider-other-polo';
                        divider.textContent = t('other_poli_polo_divider') || 'Altri poli';
                        fragment.appendChild(divider);
                        otherPoliPoloResultDividerInserted = true;
                    }

                    // Insert "Risultati in altri poli" divider before the first non-polo_result from another polo
                    if (!otherPoliDividerInserted && result.polo && result.polo !== selectedPolo && selectedPolo && result.type !== 'polo_result') {
                        const divider = document.createElement('div');
                        divider.className = 'search-results-divider';
                        divider.textContent = t('other_poli_divider') || 'Risultati in altri poli';
                        fragment.appendChild(divider);
                        otherPoliDividerInserted = true;
                    }

                    // Insert "Non su DOVE?UNIPI" divider before the first external library result
                    if (!externalLibDividerInserted && result.type === 'external_library') {
                        const divider = document.createElement('div');
                        divider.className = 'search-results-divider search-results-divider-external';
                        divider.textContent = t('not_on_dove_divider') || 'Non su DOVE?UNIPI';
                        fragment.appendChild(divider);
                        externalLibDividerInserted = true;
                    }

                    const resultElement = document.createElement('div');
                    resultElement.className = 'search-result-item';
                    resultElement.dataset.index = globalIndex;


                    // Gestione suggerimenti di autocompletamento
                    if (result.suggestion) {
                        resultElement.innerHTML = `
                            <div class="flex items-center justify-between">
                                <div class="flex-1 min-w-0">
                                    <div class="title">${result.title}</div>
                                    <div class="details">${result.details}</div>
                                </div>
                                <span class="material-symbols-outlined" style="font-size: 20px; line-height: 1;">keyboard_return</span>
                            </div>
                        `;
                        fragment.appendChild(resultElement);
                        return;
                    }

                    if (result.type === 'bot_promo') {
                        resultElement.innerHTML = `
                            <div class="flex items-center justify-between">
                                <div class="flex-1 min-w-0">
                                    <div class="title">${result.title}</div>
                                    <div class="details">
                                        ${result.details}<br>
                                        <span class="disable-promo-link" style="font-style: italic; text-decoration: underline; cursor: pointer;">${t('disable_promo')}</span>
                                    </div>
                                </div>
                                <span class="material-symbols-outlined" style="font-size: 20px; line-height: 1;">smart_toy</span>
                            </div>
                        `;
                        const disableLink = resultElement.querySelector('.disable-promo-link');
                        if (disableLink) {
                            disableLink.addEventListener('click', (e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                localStorage.setItem('bot_v2_promo_dismissed', 'true');
                                searchRooms('');
                            });
                        }
                        fragment.appendChild(resultElement);
                        return;
                    }

                    if (result.type === 'bot') {
                        resultElement.innerHTML = `
                            <div class="flex items-center justify-between">
                                <div class="flex-1 min-w-0">
                                    <div class="title">${result.title}</div>
                                    <div class="details">${result.details}</div>
                                </div>
                                <span class="material-symbols-outlined" style="font-size: 20px; line-height: 1;">smart_toy</span>
                            </div>
                        `;
                        fragment.appendChild(resultElement);
                        return;
                    }

                    if (result.type === 'feedback') {
                        resultElement.innerHTML = `
                            <div class="flex items-center justify-between">
                                <div class="flex-1 min-w-0">
                                    <div class="title">${result.title}</div>
                                    <div class="details">${result.details}</div>
                                </div>
                                <span class="material-symbols-outlined" style="font-size: 20px; line-height: 1;">${result.action === 'email' ? 'mail' : 'bug_report'}</span>
                            </div>
                        `;
                        fragment.appendChild(resultElement);
                        return;
                    }

                    if (result.type === 'share') {
                        resultElement.innerHTML = `
                            <div class="flex items-center justify-between">
                                <div>
                                    <div class="title">${result.title}</div>
                                    <div class="details">${result.details}</div>
                                </div>
                                <span class="material-symbols-outlined" data-copy-icon style="font-size: 20px; line-height: 1;">content_copy</span>
                            </div>
                        `;
                    } else if (result.type === 'polo_result') {
                        resultElement.innerHTML = `
                            <div class="title">${result.title}</div>
                            <div class="details text-gray-500">
                                ${result.address}
                                <div style="margin-top: 4px;">
                                    <a href="${result.google_maps}" target="_blank" class="text-blue-600 hover:underline" style="display: inline-flex; align-items: center; gap: 4px;" onclick="event.stopPropagation()">
                                        Apri in Google Maps
                                    </a>
                                </div>
                            </div>
                        `;
                    } else if (result.type === 'external_library') {
                        const bib = result.room;
                        const libraryNid = bib.nid;
                        const occupancyId = `library-schedule-${libraryNid}`;
                        const scheduleHTML = libraryNid ? `
                            <div class="occupancy-status-bar loading" data-library-nid="${libraryNid}">
                                <span class="occupancy-text">${t('loading_occupancy')}</span>
                            </div>
                            <div class="occupancy-details" id="${occupancyId}">
                                <div class="occupancy-details-content"></div>
                            </div>
                        ` : '';
                        resultElement.innerHTML = `
                            <div class="title">${bib.ricerca || bib.nome}</div>
                            <div class="details">${bib.indirizzo || ''}${bib.capienza > 0 ? '<div>' + t('room_detail_capacity').replace('%s', bib.capienza) + '</div>' : ''}</div>
                            ${scheduleHTML}
                        `;
                        if (libraryNid) {
                            fetchLibrarySchedule(libraryNid, resultElement);
                        }
                        fragment.appendChild(resultElement);
                        return;
                    } else {
                        const capacityDetails = result.room && result.room.capienza != null ? result.room.capienza : null;
                        const isFacility = result.isFacility || false;
                        const isLibrary = Array.isArray(result.room.type) ? result.room.type.includes('biblioteca') : result.room.type === 'biblioteca';

                        // Aggiungi classe per gli erogatori d'acqua
                        const isWaterDispenser = Array.isArray(result.room.type) ? result.room.type.includes('erogatore_acqua') : result.room.type === 'erogatore_acqua';
                        if (isFacility && isWaterDispenser) {
                            resultElement.classList.add('water-dispenser');
                        }

                        // Occupazione corrente delle aule - caricamento on-demand
                        // Skip entirely if setting is disabled or if it's a facility (from facilities.json)
                        let availabilityHTML = '';

                        const hasStatus = result.room?.hasStatus;
                        // If hasStatus is explicitly false, skip.
                        // If hasStatus is undefined (e.g. old data) or true, proceed.
                        const shouldCheckStatus = hasStatus !== false;

                        if (isLibrary) {
                            const libraryNid = result.room.nid;
                            const occupancyId = `library-schedule-${libraryNid}`;

                            availabilityHTML = `
                                <div class="occupancy-status-bar loading" data-library-nid="${libraryNid}">
                                    <span class="occupancy-text">${t('loading_occupancy')}</span>
                                </div>
                                <div class="occupancy-details" id="${occupancyId}">
                                    <div class="occupancy-details-content">
                                        <!-- Content will be filled by JS -->
                                    </div>
                                </div>
                            `;
                        } else if (settingsConfig.showClassroomStatus && !isFacility && shouldCheckStatus) {
                            const availabilitySource = window.classroomAvailability || {};
                            const classroomName = result.room?.nome || '';
                            const classroomKey = result.polo ? `${result.polo}:${classroomName}` : classroomName;
                            const availabilityData = classroomKey && availabilitySource[classroomKey];

                            let statusClass = 'loading';
                            let statusText = t('loading_occupancy');
                            let timeRange = '';
                            let showBar = true;

                            if (availabilityData) {
                                if (availabilityData.code === 0) {
                                    // Libera
                                    statusClass = 'free';
                                    statusText = t('availability_free');
                                } else if (availabilityData.code === 1) {
                                    // Occupata
                                    statusClass = 'occupied';
                                    statusText = t('availability_occupied');
                                    if (availabilityData.startTime && availabilityData.endTime) {
                                        timeRange = `${availabilityData.startTime} - ${availabilityData.endTime}`;

                                        // Parse lesson and teacher info
                                        if (availabilityData.occupiedBy) {
                                            const parts = availabilityData.occupiedBy.split('|');
                                            // occupiedBy format: "Lesson Name| |Teacher Name"
                                            const lessonName = parts[0] || '';
                                            const teacherName = parts[2] || '';

                                            if (lessonName) {
                                                timeRange += `<br><strong>${lessonName}</strong>`;
                                            }
                                            if (teacherName) {
                                                timeRange += `<br><span style="opacity:0.9">${teacherName}</span>`;
                                            }
                                        }
                                    }
                                } else if (availabilityData.code === 2) {
                                    // Non disponibile - non mostrare la barra
                                    showBar = false;
                                }
                            } else if (classroomName) {
                                // Carica i dati solo per questa aula specifica (on-demand)
                                getClassroomAvailability(classroomKey).then(availability => {
                                    const code = Number(Object.keys(availability)[0]);
                                    const value = availability[code];

                                    if (code === 1 && value) {
                                        const parts = value.split("|");
                                        let start, end, occ;

                                        // Check format: Cache (Start|End|Occ) vs Fresh (Range|Lesson| |Teacher)
                                        if (parts[0] && parts[0].includes(' - ')) {
                                            const range = parts[0];
                                            const rangeParts = range.split(' - ');
                                            start = rangeParts[0];
                                            end = rangeParts[1];
                                            occ = parts.slice(1).join('|');
                                        } else {
                                            start = parts[0];
                                            end = parts[1];
                                            occ = parts.slice(2).join('|');
                                        }

                                        window.classroomAvailability[classroomKey] = {
                                            code: 1,
                                            startTime: start || '',
                                            endTime: end || '',
                                            occupiedBy: occ || ''
                                        };
                                    } else {
                                        window.classroomAvailability[classroomKey] = {
                                            code: code,
                                            startTime: '',
                                            endTime: '',
                                            occupiedBy: ''
                                        };
                                    }

                                    // FIX: Aggiorna UI immediatamente se l'elemento esiste (tutti le occorrenze)
                                    const statusBars = currentSearchResults.querySelectorAll(`.occupancy-status-bar[data-classroom="${CSS.escape(classroomKey)}"]`);
                                    statusBars.forEach(statusBar => {
                                        statusBar.classList.remove('loading');
                                        const statusTextSpan = statusBar.querySelector('.occupancy-text');
                                        const availabilityData = window.classroomAvailability[classroomKey];

                                        if (availabilityData.code === 0) {
                                            statusBar.classList.add('free');
                                            if (statusTextSpan) statusTextSpan.textContent = t('availability_free');
                                        } else if (availabilityData.code === 1) {
                                            statusBar.classList.add('occupied');
                                            if (statusTextSpan) statusTextSpan.textContent = t('availability_occupied');

                                            // Handle details (time range)
                                            if (availabilityData.startTime && availabilityData.endTime) {
                                                const occupancyId = `occupancy-${classroomKey.replace(/[\s:]/g, '-')}-${Math.random().toString(36).substr(2, 9)}`; // Unique ID for each instance

                                                // Create expand icon if not exists
                                                if (!statusBar.querySelector('.occupancy-expand-icon')) {
                                                    const expandIcon = document.createElement('span');
                                                    expandIcon.className = 'occupancy-expand-icon material-symbols-outlined';
                                                    expandIcon.setAttribute('data-occupancy-id', occupancyId);
                                                    expandIcon.textContent = 'keyboard_arrow_down';
                                                    statusBar.appendChild(expandIcon);

                                                    // Make clickable
                                                    statusBar.style.cursor = 'pointer';
                                                    statusBar.addEventListener('click', (e) => {
                                                        e.stopPropagation();
                                                        const detailsId = expandIcon.getAttribute('data-occupancy-id');
                                                        const detailsElement = document.getElementById(detailsId);
                                                        if (detailsElement) {
                                                            detailsElement.classList.toggle('expanded');
                                                            expandIcon.classList.toggle('expanded');
                                                        }
                                                    });
                                                }

                                                // Create details container if not exists (checked by ID which is now unique per instance)
                                                // Actually, since we are iterating DOM elements, we should check relative to statusBar
                                                let detailsDiv = statusBar.nextSibling;
                                                if (!detailsDiv || !detailsDiv.classList || !detailsDiv.classList.contains('occupancy-details')) {
                                                    detailsDiv = document.createElement('div');
                                                    detailsDiv.className = 'occupancy-details';
                                                    detailsDiv.id = occupancyId;
                                                    
                                                    let content = `${availabilityData.startTime} - ${availabilityData.endTime}`;
                                                    if (availabilityData.occupiedBy) {
                                                        const p = availabilityData.occupiedBy.split('|');
                                                        const l = p[0] || '';
                                                        const t = p[2] || '';
                                                        if (l) content += `<br><strong>${l}</strong>`;
                                                        if (t) content += `<br><span style="opacity:0.9">${t}</span>`;
                                                    }

                                                    detailsDiv.innerHTML = `<div class="occupancy-details-content">${content}</div>`;
                                                    // Append after status bar
                                                    statusBar.parentNode.insertBefore(detailsDiv, statusBar.nextSibling);
                                                }
                                            }
                                        } else if (availabilityData.code === 2) {
                                            statusBar.style.display = 'none';
                                        }
                                    });
                                }).catch(error => {
                                    console.warn(`Failed to get availability for ${classroomName}:`, error);
                                    window.classroomAvailability[classroomKey] = {
                                        code: 2,
                                        startTime: '',
                                        endTime: '',
                                        occupiedBy: ''
                                    };
                                    // Update UI on error too
                                    const statusBars = currentSearchResults.querySelectorAll(`.occupancy-status-bar[data-classroom="${CSS.escape(classroomKey)}"]`);
                                    statusBars.forEach(statusBar => {
                                        statusBar.classList.remove('loading');
                                        statusBar.style.display = 'none'; // Hide on error
                                    });
                                });
                            }

                            const occupancyId = `occupancy-${classroomKey.replace(/[\s:]/g, '-')}-${Math.random().toString(36).substr(2, 9)}`;
                            availabilityHTML = showBar ? `
                                <div class="occupancy-status-bar ${statusClass}" data-classroom="${classroomKey}">
                                    <span class="occupancy-text">${statusText}</span>
                                    ${timeRange ? `<span class="occupancy-expand-icon material-symbols-outlined" data-occupancy-id="${occupancyId}">keyboard_arrow_down</span>` : ''}
                                </div>
                                ${timeRange ? `
                                <div class="occupancy-details" id="${occupancyId}">
                                    <div class="occupancy-details-content">
                                        ${timeRange}
                                    </div>
                                </div>` : ''}
                            ` : '';
                        }
                        // Fine occupazione corrente delle aule
                        
                        // Prepare details variables
                        const roomDetails = (result.isPerson && result.room.room) ?
                            ` <span class="material-symbols-outlined" style="font-size: 14px; vertical-align: -3px;">chevron_right</span> ${t('room')} ${result.room.room}` :
                            '';
                            
                        // Person Category (Role)
                        let categoryDetails = '';
                        if (result.isPerson) {
                            const cats = result.room.categoria || result.room.carica;
                            if (cats) {
                                const catString = Array.isArray(cats) ? cats.join(', ') : cats;
                                categoryDetails = `<div>${catString}</div>`;
                            }
                        }

                        const buildingPathSegment = result.edificio !== ''
                            ? `${t('building')} ${result.edificio.toUpperCase()}${(() => { const bd = data.polo[result.polo]?.edificio?.[result.edificio]; const al = bd?.alias; return al && al.length > 0 ? ' (' + al[0] + ')' : ''; })()} <span class="material-symbols-outlined" style="font-size: 14px; vertical-align: -3px;">chevron_right</span>`
                            : '';
                        resultElement.innerHTML = `
                            <div class="title">${result.room.ricerca || result.room.nome}</div>
                            <div class="details">
                                Polo ${result.polo.charAt(0).toUpperCase() + result.polo.slice(1)} <span class="material-symbols-outlined" style="font-size: 14px; vertical-align: -3px;">chevron_right</span>
                                ${buildingPathSegment}
                                ${result.piano === '0' && settingsConfig.showGroundFloor ? t('floor_ground') : t('floor') + ' ' + result.piano}${roomDetails}${categoryDetails}${capacityDetails ? '<div>' + t('capacity') + ' ' + capacityDetails + '</div>' : ''}
                            </div>
                            ${availabilityHTML}
                        `;

                        // Add click handler for occupancy bar (only for regular classrooms, not libraries)
                        // Libraries handle their own click events in updateLibraryUI
                        if (!isLibrary) {
                            const statusBar = resultElement.querySelector('.occupancy-status-bar');
                            const expandIcon = resultElement.querySelector('.occupancy-expand-icon');

                            if (statusBar && expandIcon) {
                                // Make the entire bar clickable to expand
                                statusBar.style.cursor = 'pointer';
                                statusBar.addEventListener('click', (e) => {
                                    e.stopPropagation();
                                    const detailsId = expandIcon.getAttribute('data-occupancy-id');
                                    const detailsElement = document.getElementById(detailsId);
                                    if (detailsElement) {
                                        detailsElement.classList.toggle('expanded');
                                        expandIcon.classList.toggle('expanded');
                                    }
                                });
                            }
                        }

                        if (isLibrary) {
                            fetchLibrarySchedule(result.room.nid, resultElement);
                        }

                        if (isLibrary) {
                            fetchLibrarySchedule(result.room.nid, resultElement);
                        }
                    }



                    fragment.appendChild(resultElement);
                });

                // Add notification and load more button if results were limited
                if (currentResultsShown < totalResults) {
                    const loadMoreContainer = document.createElement('div');
                    loadMoreContainer.className = 'search-result-item load-more-container';
                    loadMoreContainer.style.opacity = '0.9';
                    loadMoreContainer.innerHTML = `
                        <div class="details" style="font-style: italic;">
                            ${t('showing_limited_results').replace('%s', currentResultsShown).replace('%s', totalResults)} · 
                            <span class="load-more-link" style="cursor: pointer; text-decoration: underline;">
                                ${t('load_more_results')}
                            </span>
                        </div>
                    `;

                    // Add click handler for load more link
                    const loadMoreLink = loadMoreContainer.querySelector('.load-more-link');
                    loadMoreLink.addEventListener('click', (e) => {
                        e.stopPropagation();
                        displaySearchResults(allSearchResults, false, true);
                    });

                    // Add hover effect
                    loadMoreLink.addEventListener('mouseenter', () => {
                        loadMoreLink.style.opacity = '0.7';
                    });
                    loadMoreLink.addEventListener('mouseleave', () => {
                        loadMoreLink.style.opacity = '1';
                    });

                    fragment.appendChild(loadMoreContainer);
                }

                currentSearchResults.appendChild(fragment);

                // Restore the previous selection index if it's still valid
                const items = currentSearchResults.querySelectorAll('.search-result-item');
                if (previousIndex >= 0 && previousIndex < items.length) {
                    selectedSearchResultIndex = previousIndex;
                    items[previousIndex].classList.add('selected');
                } else {
                    selectedSearchResultIndex = -1;
                    document.body.classList.remove('keyboard-navigation-active');
                }

                finalizeAndAnimate();

                // Reset scroll position to top after showing the results panel (but not when loading more)
                if (currentSearchResults && !loadMore) {
                    currentSearchResults.scrollTop = 0;
                }

                manageOccupancyRefreshLoop();
            }

            function renderSettingsBlock(container) {
                const settingsItems = [
                    {
                        key: 'classroomStatus',
                        label: t('settings_classroom_status'),
                        description: t('settings_classroom_status_description'),
                        checked: settingsConfig.showClassroomStatus,
                        onToggle: setClassroomStatusSetting
                    },
                    {
                        key: 'showGroundFloor',
                        label: t('settings_show_ground_floor'),
                        description: t('settings_show_ground_floor_description'),
                        checked: settingsConfig.showGroundFloor,
                        onToggle: setShowGroundFloorSetting
                    },
                    {
                        key: 'shareCoordinates',
                        label: t('settings_share_coordinates'),
                        description: t('settings_share_coordinates_description'),
                        checked: settingsConfig.shareCoordinates,
                        onToggle: setShareCoordinatesSetting
                    },
                    {
                        key: 'extraControls',
                        label: t('settings_extra_controls'),
                        description: t('settings_extra_controls_description'),
                        checked: accessibilityToggle.checked,
                        onToggle: setExtraControlsSetting
                    },
                    {
                        key: 'waterDispensers',
                        label: t('settings_water_dispensers'),
                        description: t('settings_water_dispensers_description'),
                        checked: settingsConfig.showWaterDispensers,
                        onToggle: setWaterDispensersSetting
                    },
                    {
                        key: 'studyRooms',
                        label: t('settings_study_rooms'),
                        description: t('settings_study_rooms_description'),
                        checked: settingsConfig.showStudyRooms,
                        onToggle: setStudyRoomsSetting
                    },
                    {
                        key: 'highContrast',
                        label: t('settings_high_contrast'),
                        description: t('settings_high_contrast_description'),
                        checked: settingsConfig.highContrast,
                        onToggle: setHighContrastSetting
                    },
                    {
                        key: 'dyslexicFont',
                        label: t('settings_dyslexic_font'),
                        description: t('settings_dyslexic_font_description'),
                        checked: settingsConfig.dyslexicFont,
                        onToggle: setDyslexicFontSetting
                    },
                    {
                        key: 'copyLinkOnSelect',
                        label: t('settings_copy_link_on_select'),
                        description: t('settings_copy_link_on_select_description'),
                        checked: settingsConfig.copyLinkOnSelect,
                        onToggle: setCopyLinkOnSelectSetting
                    },
                    {
                        key: 'poiBlinking',
                        label: t('settings_poi_blinking'),
                        description: t('settings_poi_blinking_description'),
                        checked: settingsConfig.poiBlinking,
                        onToggle: setPoiBlinkingSetting
                    }
                ];

                settingsItems.forEach(config => {
                    const row = document.createElement('div');
                    row.className = 'search-result-item flex items-center justify-between gap-4';
                    const toggleContent = createSettingsToggle(config);
                    row.appendChild(toggleContent);

                    row.addEventListener('click', (event) => {
                        event.stopPropagation(); // Prevent closing search results
                        const targetElement = event.target instanceof Element ? event.target : null;
                        if ((targetElement && targetElement.closest('label')) || targetElement instanceof HTMLInputElement) {
                            return;
                        }
                        const input = row.querySelector('input[data-settings-toggle]');
                        if (input) {
                            input.checked = !input.checked;
                            input.dispatchEvent(new Event('change'));
                        }
                    });

                    container.appendChild(row);
                });

                // Add text size control
                const textSizeRow = document.createElement('div');
                textSizeRow.className = 'search-result-item flex items-center justify-between gap-4';
                const textSizeControl = createTextSizeControl({
                    label: t('settings_text_size'),
                    description: t('settings_text_size_description')
                });
                textSizeRow.appendChild(textSizeControl);
                textSizeRow.addEventListener('click', (event) => {
                    event.stopPropagation(); // Prevent closing search results
                });
                container.appendChild(textSizeRow);

                // Add language selector
                const languageRow = document.createElement('div');
                languageRow.className = 'search-result-item flex items-center justify-between gap-4';
                const languageControl = createLanguageSelector({
                    label: t('settings_language'),
                    description: t('settings_language_description')
                });
                languageRow.appendChild(languageControl);
                languageRow.addEventListener('click', (event) => {
                    event.stopPropagation(); // Prevent closing search results
                });
                container.appendChild(languageRow);

                // Add Reset Button
                const resetRow = document.createElement('div');
                resetRow.className = 'search-result-item flex items-center justify-between gap-4';
                
                // Load more styling: <div class="details" style="font-style: italic;">...<span class="load-more-link" style="cursor: pointer; text-decoration: underline;">...</span></div>
                // User asked: "voglio che sia scritto come quello di caricare più elementi nella search"
                // That logic is: 
                // <div class="search-result-item load-more-container" style="opacity: 0.9;">
                //    <div class="details" style="font-style: italic;"> 
                //       ... <span class="load-more-link" style="cursor: pointer; text-decoration: underline;">Load more...</span>
                //    </div>
                // </div>

                resetRow.className = 'search-result-item reset-settings-container';
                resetRow.style.opacity = '0.9';
                resetRow.innerHTML = `
                    <div class="details" style="font-style: italic;">
                        ${t('settings_reset_description')} · 
                        <span class="reset-settings-link" style="cursor: pointer; text-decoration: underline;">
                            ${t('settings_reset')}
                        </span>
                    </div>
                `;
                
                const resetLink = resetRow.querySelector('.reset-settings-link');
                resetRow.addEventListener('click', (e) => {
                     e.stopPropagation();
                     // Trigger logic if clicked on the row/link
                });
                resetLink.addEventListener('click', (e) => {
                    e.stopPropagation();
                    resetSettingsToDefault();
                });
                // Hover effect
                resetLink.addEventListener('mouseenter', () => {
                   resetLink.style.opacity = '0.7';
                });
                resetLink.addEventListener('mouseleave', () => {
                   resetLink.style.opacity = '1';
                });

                container.appendChild(resetRow);

                syncSettingsToggles();
            }

            function resetSettingsToDefault() {
                 // 1. Reset values
                 // mostra stato aule:on
                 setClassroomStatusSetting(true);
                 // mostra piano terra: on
                 setShowGroundFloorSetting(true);
                 // condividi coordinate mappa: on
                 setShareCoordinatesSetting(true);
                 // controlli extra:off
                 setExtraControlsSetting(false);
                 // mostra erogatori, aule studio: on (assuming handled by waterDispensers and studyRooms)
                 setWaterDispensersSetting(true);
                 setStudyRoomsSetting(true);
                 // altro contrasto: off
                 setHighContrastSetting(false);
                 // font per dislessia: off
                 setDyslexicFontSetting(false);
                 // copia il link alla selezione: off
                 setCopyLinkOnSelectSetting(false);
                 // poi blinking: off
                 setPoiBlinkingSetting(false);
                 // testo: normale
                 setTextSizeSetting('text-normal');
                 
                 // 2. Clear Promo Dismissal
                 localStorage.removeItem('bot_v2_promo_dismissed');
                 
                 // 3. UI Feedback (Optional: close settings or flash message)
                 // Just refreshing the view is good.
                 // Maybe re-render logic to update toggles is handled by setters calling syncSettingsToggles()
                 
                 // 4. Force search refresh to show promo if field is empty
                 const currentSearchInput = isMobile() ? searchInputMobile : searchInput;
                 if (currentSearchInput && currentSearchInput.value.trim() === '') {
                     searchRooms('');
                 }
            }

            function createSettingsToggle({ key, label, description, checked, onToggle, disabled = false }) {
                const wrapper = document.createElement('div');
                wrapper.className = 'flex items-center justify-between gap-4 w-full';

                const textContainer = document.createElement('div');
                textContainer.className = 'flex flex-col text-left flex-1 min-w-0';

                const titleSpan = document.createElement('span');
                titleSpan.className = 'title';
                titleSpan.textContent = label;
                textContainer.appendChild(titleSpan);

                if (description) {
                    const descriptionSpan = document.createElement('span');
                    descriptionSpan.className = 'details';
                    descriptionSpan.textContent = description;
                    textContainer.appendChild(descriptionSpan);
                }

                const switchLabel = document.createElement('label');
                switchLabel.className = 'relative inline-flex items-center flex-shrink-0' + (disabled ? ' opacity-50 cursor-not-allowed' : ' cursor-pointer');

                const input = document.createElement('input');
                input.type = 'checkbox';
                input.className = 'sr-only peer';
                input.dataset.settingsToggle = key;
                input.checked = checked;
                input.disabled = disabled;

                const slider = document.createElement('div');
                slider.className = "w-11 h-6 bg-gray-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gray-800";

                input.addEventListener('change', () => {
                    if (!disabled) {
                        onToggle(input.checked);
                    }
                });

                switchLabel.appendChild(input);
                switchLabel.appendChild(slider);

                wrapper.appendChild(textContainer);
                wrapper.appendChild(switchLabel);

                return wrapper;
            }

            function createTextSizeControl({ label, description }) {
                const wrapper = document.createElement('div');
                wrapper.className = 'flex flex-col gap-3 w-full';

                const textContainer = document.createElement('div');
                textContainer.className = 'flex flex-col text-left flex-1 min-w-0';

                const titleSpan = document.createElement('span');
                titleSpan.className = 'title';
                titleSpan.textContent = label;
                textContainer.appendChild(titleSpan);

                if (description) {
                    const descriptionSpan = document.createElement('span');
                    descriptionSpan.className = 'details';
                    descriptionSpan.textContent = description;
                    textContainer.appendChild(descriptionSpan);
                }

                const controlsContainer = document.createElement('div');
                controlsContainer.className = 'text-size-controls flex-shrink-0 self-end';

                const textSizes = ['text-small', 'text-normal', 'text-large', 'text-xlarge'];
                const sizeLabels = ['A-', 'A', 'A+', 'A++'];

                const buttons = [];

                textSizes.forEach((size, index) => {
                    const btn = document.createElement('button');
                    btn.className = 'text-size-btn';
                    btn.textContent = sizeLabels[index];
                    btn.title = `Imposta dimensione: ${sizeLabels[index]}`;
                    btn.dataset.size = size;

                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        setTextSizeSetting(size);
                    });

                    buttons.push(btn);
                    controlsContainer.appendChild(btn);
                });

                function updateTextSize() {
                    const currentSize = textSizes.findIndex(size => document.body.classList.contains(size));
                    const index = currentSize >= 0 ? currentSize : 1;

                    buttons.forEach((btn, i) => {
                        if (i === index) {
                            btn.classList.add('active');
                        } else {
                            btn.classList.remove('active');
                        }
                    });
                }

                wrapper.appendChild(textContainer);
                wrapper.appendChild(controlsContainer);

                // Initial update
                updateTextSize();

                // Store reference for syncing
                controlsContainer.updateTextSize = updateTextSize;

                return wrapper;
            }

            function createLanguageSelector({ label, description }) {
                const wrapper = document.createElement('div');
                wrapper.className = 'flex flex-col gap-3 w-full';

                const textContainer = document.createElement('div');
                textContainer.className = 'flex flex-col text-left flex-1 min-w-0';

                const titleSpan = document.createElement('span');
                titleSpan.className = 'title';
                titleSpan.textContent = label;
                textContainer.appendChild(titleSpan);

                if (description) {
                    const descriptionSpan = document.createElement('span');
                    descriptionSpan.className = 'details';
                    descriptionSpan.textContent = description;
                    textContainer.appendChild(descriptionSpan);
                }

                const controlsContainer = document.createElement('div');
                controlsContainer.className = 'language-selector flex-shrink-0 self-end';

                const buttons = [];

                SUPPORTED_LANGUAGES.forEach(lang => {
                    const btn = document.createElement('button');
                    btn.className = 'language-btn';
                    btn.textContent = lang.label;
                    btn.title = lang.title;
                    btn.dataset.lang = lang.code;

                    if (currentLanguage === lang.code) {
                        btn.classList.add('active');
                    }

                    btn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        if (currentLanguage !== lang.code) {
                            await setLanguageSetting(lang.code);
                            // Update active state
                            buttons.forEach(b => b.classList.remove('active'));
                            btn.classList.add('active');
                        }
                    });

                    buttons.push(btn);
                    controlsContainer.appendChild(btn);
                });

                wrapper.appendChild(textContainer);
                wrapper.appendChild(controlsContainer);

                return wrapper;
            }

            function setShareCoordinatesSetting(isEnabled) {
                settingsConfig.shareCoordinates = isEnabled;
                localStorage.setItem('shareCoordinatesEnabled', isEnabled);
                updateURL(true);
                syncSettingsToggles();
            }

            function setExtraControlsSetting(isEnabled) {
                if (accessibilityToggle.checked !== isEnabled) {
                    accessibilityToggle.checked = isEnabled;
                }
                const changeEvent = new Event('change', { bubbles: true });
                accessibilityToggle.dispatchEvent(changeEvent);
                syncSettingsToggles();
            }

            function setHighContrastSetting(isEnabled) {
                settingsConfig.highContrast = isEnabled;
                localStorage.setItem('highContrastEnabled', isEnabled);
                if (isEnabled) {
                    document.body.classList.add('high-contrast');
                } else {
                    document.body.classList.remove('high-contrast');
                }
                syncSettingsToggles();
            }

            function setDyslexicFontSetting(isEnabled) {
                settingsConfig.dyslexicFont = isEnabled;
                localStorage.setItem('dyslexicFontEnabled', isEnabled);
                if (isEnabled) {
                    document.body.classList.add('dyslexic-font');
                } else {
                    document.body.classList.remove('dyslexic-font');
                }
                syncSettingsToggles();
            }

            function setCopyLinkOnSelectSetting(isEnabled) {
                settingsConfig.copyLinkOnSelect = isEnabled;
                localStorage.setItem('copyLinkOnSelectEnabled', isEnabled);
                syncSettingsToggles();
            }

            function setPoiBlinkingSetting(isEnabled) {
                settingsConfig.poiBlinking = isEnabled;
                localStorage.setItem('poiBlinkingEnabled', isEnabled);
                if (isEnabled) {
                    document.body.classList.add('poi-blinking-enabled');
                } else {
                    document.body.classList.remove('poi-blinking-enabled');
                }
                syncSettingsToggles();
            }

            function setWaterDispensersSetting(isEnabled) {
                settingsConfig.showWaterDispensers = isEnabled;
                localStorage.setItem('showWaterDispensersEnabled', isEnabled);
                if (isEnabled) {
                    showWaterDispensers();
                } else {
                    hideWaterDispensers();
                }
                syncSettingsToggles();
            }

            function setStudyRoomsSetting(isEnabled) {
                settingsConfig.showStudyRooms = isEnabled;
                localStorage.setItem('showStudyRoomsEnabled', isEnabled);
                if (isEnabled) {
                    showStudyRoomMarkers();
                } else {
                    hideStudyRoomMarkers();
                }
                syncSettingsToggles();
            }

            function setClassroomStatusSetting(isEnabled) {
                settingsConfig.showClassroomStatus = isEnabled;
                localStorage.setItem('showClassroomStatusEnabled', isEnabled);
                syncSettingsToggles();
            }

            function setShowGroundFloorSetting(isEnabled) {
                settingsConfig.showGroundFloor = isEnabled;
                localStorage.setItem('showGroundFloorEnabled', isEnabled);
                syncSettingsToggles();

                // Refresh UI
                if (typeof selectedBuilding !== 'undefined' && selectedBuilding != null) {
                    populateFloors(selectedBuilding);
                    // Reapply selection to current floor after regenerating buttons
                    if (typeof selectedFloor !== 'undefined' && selectedFloor) {
                        Array.from(floorsList.children).forEach(child => {
                            const floorValue = child.dataset.floor;
                            if (floorValue === selectedFloor) {
                                child.classList.add('selected');
                            } else {
                                child.classList.remove('selected');
                            }
                        });
                    }
                }

                // Refresh search results if active, BUT NOT if we are in settings (to preserve animation)
                const currentSearchInput = isMobile() ? searchInputMobile : searchInput;
                if (currentSearchInput && currentSearchInput.value.trim() !== '') {
                    const query = currentSearchInput.value.toLowerCase();
                    // Only refresh if we are NOT in the settings menu
                    if (!query.includes('impostazioni') && !query.includes('settings')) {
                        searchRooms(currentSearchInput.value);
                    }
                }
            }


            function setTextSizeSetting(sizeClass) {
                const textSizes = ['text-small', 'text-normal', 'text-large', 'text-xlarge'];
                // Remove all text size classes
                textSizes.forEach(size => document.body.classList.remove(size));
                // Add the new size class
                document.body.classList.add(sizeClass);
                // Save to localStorage
                localStorage.setItem('textSizeEnabled', sizeClass);
                // Update all text size controls
                syncTextSizeControls();
            }

            async function setLanguageSetting(lang) {
                const success = await loadTranslations(lang);
                if (success) {
                    settingsConfig.language = lang;
                    localStorage.setItem('selectedLanguage', lang);
                    translationsLoaded = true;

                    // Apply translations multiple times to ensure they stick on mobile
                    applyTranslations();

                    // Retry after a short delay to catch any late-loading elements
                    setTimeout(() => applyTranslations(), 100);

                    // Refresh the current view to update all text
                    if (selectedPolo && selectedBuilding != null && selectedFloor) {
                        populateBuildings(Object.keys(data.polo[selectedPolo].edificio));
                        populateFloors(selectedBuilding);
                        populateRooms(selectedBuilding, selectedFloor);
                    }

                    // Refresh search results if visible
                    const currentSearchResults = isMobile() ? searchResultsMobile : searchResults;
                    const currentSearchInput = isMobile() ? searchInputMobile : searchInput;
                    if (currentSearchResults && !currentSearchResults.classList.contains('hidden') && currentSearchInput) {
                        searchRooms(currentSearchInput.value);
                    }
                }
            }

            function syncTextSizeControls() {
                // Update all text size control displays
                document.querySelectorAll('.text-size-controls').forEach(controls => {
                    if (typeof controls.updateTextSize === 'function') {
                        controls.updateTextSize();
                        return;
                    }

                    const wrapper = controls.closest('.search-result-item');
                    if (wrapper && typeof wrapper.updateTextSize === 'function') {
                        wrapper.updateTextSize();
                    }
                });
            }

            function syncSettingsToggles() {
                document.querySelectorAll('input[data-settings-toggle]').forEach(input => {
                    const toggleType = input.getAttribute('data-settings-toggle');
                    switch (toggleType) {
                        case 'shareCoordinates':
                            input.checked = settingsConfig.shareCoordinates;
                            break;
                        case 'extraControls':
                            input.checked = accessibilityToggle.checked;
                            break;
                        case 'waterDispensers':
                            input.checked = settingsConfig.showWaterDispensers;
                            break;
                        case 'studyRooms':
                            input.checked = settingsConfig.showStudyRooms;
                            break;
                        case 'highContrast':
                            input.checked = settingsConfig.highContrast;
                            break;
                        case 'dyslexicFont':
                            input.checked = settingsConfig.dyslexicFont;
                            break;
                        case 'classroomStatus':
                            input.checked = settingsConfig.showClassroomStatus;
                            break;
                        case 'showGroundFloor':
                            input.checked = settingsConfig.showGroundFloor;
                            break;
                        case 'copyLinkOnSelect':
                            input.checked = settingsConfig.copyLinkOnSelect;
                            break;
                        case 'poiBlinking':
                            input.checked = settingsConfig.poiBlinking;
                            break;
                        default:
                            break;
                    }
                });
            }

            function updateSelectedSearchResult(index) {
                const currentSearchResults = isMobile() ? searchResultsMobile : searchResults;
                const items = currentSearchResults.querySelectorAll('.search-result-item');
                if (selectedSearchResultIndex > -1 && items[selectedSearchResultIndex]) {
                    items[selectedSearchResultIndex].classList.remove('selected');
                }
                selectedSearchResultIndex = index;
                if (selectedSearchResultIndex > -1 && items[selectedSearchResultIndex]) {
                    items[selectedSearchResultIndex].classList.add('selected');
                }
            }

            // Event listener per la ricerca
            let searchDebounceTimer = null;
            function setupSearchListeners(inputElement, resultsElement, clearButtonElement = null) {
                inputElement.addEventListener('input', (e) => {
                    const query = e.target.value;
                    // Sincronizza l'altro input
                    const otherInput = inputElement === searchInput ? searchInputMobile : searchInput;
                    otherInput.value = query;

                    // Debounce per migliorare le performance quando si digita velocemente
                    if (searchDebounceTimer) {
                        clearTimeout(searchDebounceTimer);
                    }
                    searchDebounceTimer = setTimeout(() => {
                        searchRooms(query);
                    }, 0);

                    updateClearButtonsVisibility();
                });

                // Aggiungi listener per il focus: mostra i risultati se c'è del testo
                inputElement.addEventListener('focus', (e) => {
                    const query = e.target.value.trim();
                    const currentSearchResults = isMobile() ? searchResultsMobile : searchResults;

                    // Only search if results are hidden or empty to avoid re-rendering and losing state (e.g. animations)
                    if (query && (currentSearchResults.classList.contains('hidden') || currentSearchResults.innerHTML === '')) {
                        searchRooms(query);
                    }
                });

                inputElement.addEventListener('keydown', (e) => {
                    const currentSearchResults = isMobile() ? searchResultsMobile : searchResults;
                    const items = currentSearchResults.querySelectorAll('.search-result-item');
                    if (currentSearchResults.classList.contains('hidden') || items.length === 0) return;

                    if (e.key === 'ArrowDown') {
                        isKeyboardSelection = true;
                        document.body.classList.add('keyboard-navigation-active');
                        // Attiva il listener mousemove solo ora
                        document.addEventListener('mousemove', handleMouseMoveDuringKeyboardNav);
                        e.preventDefault();
                        const newIndex = (selectedSearchResultIndex + 1) % items.length;
                        updateSelectedSearchResult(newIndex);
                        // Scroll into view only when using arrow keys
                        if (items[newIndex]) {
                            items[newIndex].scrollIntoView({
                                behavior: 'smooth',
                                block: 'nearest',
                                inline: 'nearest'
                            });
                        }
                    } else if (e.key === 'ArrowUp') {
                        isKeyboardSelection = true;
                        document.body.classList.add('keyboard-navigation-active');
                        // Attiva il listener mousemove solo ora
                        document.addEventListener('mousemove', handleMouseMoveDuringKeyboardNav);
                        e.preventDefault();
                        const newIndex = (selectedSearchResultIndex - 1 + items.length) % items.length;
                        updateSelectedSearchResult(newIndex);
                        // Scroll into view only when using arrow keys
                        if (items[newIndex]) {
                            items[newIndex].scrollIntoView({
                                behavior: 'smooth',
                                block: 'nearest',
                                inline: 'nearest'
                            });
                        }
                    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                        isKeyboardSelection = true;
                        document.body.classList.add('keyboard-navigation-active');
                        // Attiva il listener mousemove solo ora
                        document.addEventListener('mousemove', handleMouseMoveDuringKeyboardNav);
                        // Handle horizontal navigation within multi-button settings
                        if (selectedSearchResultIndex > -1 && items[selectedSearchResultIndex]) {
                            const currentItem = items[selectedSearchResultIndex];

                            // Check if this item has multi-button controls (text size or language)
                            const textSizeControls = currentItem.querySelector('.text-size-controls');
                            const languageSelector = currentItem.querySelector('.language-selector');

                            if (textSizeControls || languageSelector) {
                                e.preventDefault();
                                const container = textSizeControls || languageSelector;
                                const buttons = Array.from(container.querySelectorAll('button'));
                                const activeButton = buttons.find(btn => btn.classList.contains('active'));

                                if (activeButton) {
                                    const currentIndex = buttons.indexOf(activeButton);
                                    let newIndex;

                                    if (e.key === 'ArrowRight') {
                                        newIndex = (currentIndex + 1) % buttons.length;
                                    } else {
                                        newIndex = (currentIndex - 1 + buttons.length) % buttons.length;
                                    }

                                    // Click the new button to activate it
                                    buttons[newIndex].click();
                                }
                            }
                        }
                    } else if (e.key === 'Enter') {
                        e.preventDefault();

                        const clickResultItem = (itemElement) => {
                            const isSpecialResult = itemElement.querySelector('.material-symbols-outlined[data-copy-icon]') ||
                                itemElement.textContent.includes('Feedback') ||
                                itemElement.textContent.includes('Bot') ||
                                itemElement.querySelector('input[data-settings-toggle]');
                            itemElement.click();
                            // Only blur if it's not a special result (feedback, bot, share, settings)
                            if (!isSpecialResult) {
                                inputElement.blur();
                            }
                        };

                        // Se c'è un solo risultato nel polo corrente, selezionalo automaticamente
                        const query = inputElement.value.trim().toLowerCase();
                        const currentPoloItems = Array.from(items).filter(item => {
                            const idx = parseInt(item.dataset.index, 10);
                            if (isNaN(idx)) return false;
                            const r = allSearchResults[idx];
                            return r && r.polo === selectedPolo && r.room && !r.suggestion;
                        });
                        // Priorità: unico match per nome/ricerca principale (non alias)
                        const primaryNameItems = currentPoloItems.filter(item => {
                            const idx = parseInt(item.dataset.index, 10);
                            const r = allSearchResults[idx];
                            const name = (r.room.ricerca || r.room.nome || '').toLowerCase();
                            return name.includes(query);
                        });
                        if (primaryNameItems.length === 1) {
                            clickResultItem(primaryNameItems[0]);
                        } else if (currentPoloItems.length === 1) {
                            clickResultItem(currentPoloItems[0]);
                        } else if (items.length === 1) {
                            clickResultItem(items[0]);
                        } else if (selectedSearchResultIndex > -1 && items[selectedSearchResultIndex]) {
                            // Se c'è un elemento selezionato con le frecce, cliccalo
                            const itemElement = items[selectedSearchResultIndex];

                            // Check if this item has multi-button controls (text size or language)
                            // In this case, Enter should be ignored as navigation is done via Left/Right arrows
                            const hasMultiButtons = itemElement.querySelector('.text-size-controls') ||
                                itemElement.querySelector('.language-selector');

                            if (hasMultiButtons) {
                                return;
                            }

                            clickResultItem(itemElement);
                        } else {
                            // Altrimenti, se c'è un suggerimento visibile (primo elemento), completalo automaticamente
                            const firstItem = items[0];
                            if (firstItem) {
                                const isSuggestion = firstItem.querySelector('.material-symbols-outlined')?.textContent.trim() === 'keyboard_return';
                                if (isSuggestion) {
                                    // È un suggerimento, cliccalo automaticamente
                                    // Don't blur to allow arrow navigation after suggestion is completed
                                    firstItem.click();
                                }
                            }
                        }
                    } else if (e.key === 'Escape') {
                        e.preventDefault();
                        selectedSearchResultIndex = -1;
                        document.body.classList.remove('keyboard-navigation-active');
                        if (clearButtonElement && !clearButtonElement.classList.contains('hidden')) {
                            clearButtonElement.click();
                        } else {
                            currentSearchResults.classList.add('hidden');
                        }
                    }
                });

                if (clearButtonElement) {
                    clearButtonElement.addEventListener('click', () => {
                        inputElement.value = '';
                        const otherInput = inputElement === searchInput ? searchInputMobile : searchInput;
                        if (otherInput) {
                            otherInput.value = '';
                        }
                        selectedSearchResultIndex = -1;
                        document.body.classList.remove('keyboard-navigation-active');
                        searchRooms('');
                        hideSearchResultsPanels();
                        updateClearButtonsVisibility();
                        clearSelectedRoomMarker();
                        inputElement.focus();
                    });
                }
            }

            setupSearchListeners(searchInput, searchResults, clearSearchBtn);
            setupSearchListeners(searchInputMobile, searchResultsMobile, clearSearchBtnMobile);
            updateClearButtonsVisibility();





            // Riabilita l'hover del mouse quando l'utente muove il mouse dopo la navigazione da tastiera
            let lastMouseX = 0;
            let lastMouseY = 0;
            // Funzione per gestire il reset della navigazione da tastiera al movimento del mouse
            function handleMouseMoveDuringKeyboardNav(e) {
                // Rileva un movimento significativo del mouse (non solo piccole vibrazioni)
                const hasMoved = Math.abs(e.clientX - lastMouseX) > 10 || Math.abs(e.clientY - lastMouseY) > 10;

                if (hasMoved) {
                    // Rimuovi la selezione da tastiera
                    const currentSearchResults = isMobile() ? searchResultsMobile : searchResults;
                    const items = currentSearchResults.querySelectorAll('.search-result-item');
                    if (selectedSearchResultIndex > -1 && items[selectedSearchResultIndex]) {
                        items[selectedSearchResultIndex].classList.remove('selected');
                    }
                    selectedSearchResultIndex = -1;
                    isKeyboardSelection = false;
                    document.body.classList.remove('keyboard-navigation-active');

                    // Importante: rimuovi il listener una volta che il mouse è stato usato
                    document.removeEventListener('mousemove', handleMouseMoveDuringKeyboardNav);
                }
                lastMouseX = e.clientX;
                lastMouseY = e.clientY;
            }

            // Nota: Il listener 'mousemove' globale continuo è stato rimosso per performance.
            // Viene attaccato solo quando si attiva la navigazione da tastiera.

            // Aggiungi listener per le scorciatoie da tastiera
            document.addEventListener('keydown', (e) => {
                // Scorciatoia per aprire/chiudere la sidebar (Cmd+Enter su Mac, Ctrl+Enter su Windows)
                const isMac = /Mac/i.test(navigator.userAgent);
                const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

                if (isCmdOrCtrl && e.key === 'Enter') {
                    e.preventDefault();
                    if (sidebar.classList.contains('-translate-x-full')) {
                        openSidebar();
                    } else {
                        closeSidebar();
                    }
                    return;
                }

                // Scorciatoie con modificatori (Ctrl+Alt+J, Ctrl+Alt+K)
                if ((e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') && e.ctrlKey && e.altKey) {
                    // Permetti le scorciatoie anche se si è in un input
                    switch (e.key.toLowerCase()) {
                        case 'j':
                            e.preventDefault();
                            shareBtn.click();
                            return;
                        case 'k':
                            e.preventDefault();
                            resetZoomBtn.click();
                            return;
                    }
                }

                // Non attivare altre funzionalità se si sta scrivendo in un campo di input
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                    return;
                }

                // Uso Ctrl + Alt su tutti i sistemi per coerenza ed evitare conflitti su Mac
                if (e.ctrlKey && e.altKey) {
                    switch (e.key.toLowerCase()) {
                        case 'j':
                            e.preventDefault();
                            shareBtn.click();
                            break;
                        case 'k':
                            e.preventDefault();
                            resetZoomBtn.click();
                            break;
                    }
                    return;
                }

                // Nuova funzionalità: apri ricerca quando si inizia a digitare
                // Ignora tasti speciali, modificatori, frecce, etc.
                const ignoredKeys = [
                    'Control', 'Shift', 'Alt', 'Meta', 'Escape', 'Tab',
                    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
                    'Enter', 'Backspace', 'Delete', 'CapsLock', 'Home', 'End',
                    'PageUp', 'PageDown', 'Insert', 'NumLock', 'ScrollLock', 'Pause',
                    'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'
                ];

                if (ignoredKeys.includes(e.key)) {
                    return;
                }

                // Ignora combinazioni con tasti modificatori (eccetto Shift per maiuscole)
                if (e.ctrlKey || e.metaKey || e.altKey) {
                    return;
                }

                // Se è un carattere alfanumerico o simbolo stampabile
                if (e.key.length === 1) {
                    e.preventDefault();

                    // Focus sull'input appropriato (desktop o mobile)
                    const targetInput = isMobile() ? searchInputMobile : searchInput;
                    if (targetInput) {
                        targetInput.focus();
                        // Aggiungi il carattere digitato
                        targetInput.value = e.key;
                        // Trigger search
                        searchRooms(e.key);
                    }
                }
            });

            // Nascondi i risultati se si clicca fuori
            document.addEventListener('click', (e) => {
                const searchContainer = document.getElementById('search-container');
                const mobileSearchContainer = document.getElementById('mobile-search-container');
                const isSearchClick = (searchContainer && searchContainer.contains(e.target)) || 
                                     (mobileSearchContainer && mobileSearchContainer.contains(e.target));
                
                // Don't hide if clicking on a promo result or disable link
                if (e.target.closest('.search-result-item') || e.target.classList.contains('disable-promo-link')) {
                    return;
                }

                if (!isSearchClick) {
                    const currentSearchResults = isMobile() ? searchResultsMobile : searchResults;
                    const isPromoVisible = currentSearchResults && 
                                          currentSearchResults.querySelector('.search-result-item .title') && 
                                          currentSearchResults.innerHTML.includes('bot_promo');
                    
                    // If promo is visible, do not hide results on click outside
                    // Unless the user explicitly cleared the search or something else logic handles it.
                    // Actually, usually we hide results. But the user wants it to show "always".
                    // "Always when the field is empty".
                    // So if it's the promo, we might want to keep it?
                    // But if I click on the map I probably want to see the map.
                    // The user said "show it always not just when I click in the field".
                    // This creates a conflict with map interaction.
                    // If the results block the map, the app becomes unusable.
                    // However, the promo is just one item, small height.
                    // I will check if the search input is empty. If empty and promo is active, don't hide?
                    
                    const searchInputEl = isMobile() ? searchInputMobile : searchInput;
                    const isEmpty = searchInputEl && searchInputEl.value.trim() === '';
                    
                    if (isEmpty && isPromoVisible) {
                        // Keep it visible
                        return;
                    }

                    hideSearchResultsPanels();
                }
            });

            // Funzione per mostrare/nascondere le impostazioni
            if (settingsBtn) {
                settingsBtn.addEventListener('click', () => {
                    const input = window.innerWidth <= 768 ? searchInputMobile : searchInput;
                    if (input) {
                        if (input.value.trim().toLowerCase() === 'impostazioni') {
                            input.value = '';
                            input.dispatchEvent(new Event('input', { bubbles: true }));
                            input.blur();
                        } else {
                            input.value = 'impostazioni';
                            input.dispatchEvent(new Event('input', { bubbles: true }));
                            
                            // Chiudi la sidebar se aperta (su mobile è utile)
                            const sidebar = document.getElementById('sidebar');
                            if (sidebar && !sidebar.classList.contains('-translate-x-full')) {
                                const closeBtn = document.getElementById('close-sidebar-button');
                                if (closeBtn) closeBtn.click();
                            }
                            
                            setTimeout(() => input.focus(), 50);
                        }
                    }
                });
            }

            // Funzione per copiare il link
            shareBtn.addEventListener('click', () => {
                // Aggiungi feedback visivo istantaneo
                shareBtn.classList.add('mobile-active');
                setTimeout(() => {
                    shareBtn.classList.remove('mobile-active');
                }, 200); // Rimuovi dopo 200ms

                const url = window.location.href;
                navigator.clipboard.writeText(url).then(() => {
                    // Feedback per l'utente (tooltip)
                    const originalTooltip = shareBtn.getAttribute('data-tooltip');
                    shareBtn.setAttribute('data-tooltip', t('share_link_copied'));
                    showTooltip({ currentTarget: shareBtn }); // Mostra subito il nuovo tooltip
                    setTimeout(() => {
                        shareBtn.setAttribute('data-tooltip', originalTooltip);
                        hideTooltip();
                    }, 2000);
                }).catch(err => {
                    console.error('Errore nella copia del link: ', err);
                    // Fallback per l'utente
                    const originalTooltip = shareBtn.getAttribute('data-tooltip');
                    shareBtn.setAttribute('data-tooltip', t('share_error_short'));
                    showTooltip({ currentTarget: shareBtn });
                    setTimeout(() => {
                        shareBtn.setAttribute('data-tooltip', originalTooltip);
                        hideTooltip();
                    }, 2000);
                });
            });

            // Funzione per aggiornare l'URL
            function updateURL(replace = false) {
                if (!selectedPolo) return;

                const appIndexPath = getAppIndexPath();
                const contextPath = getCanonicalContextOverridePath()
                    || buildCanonicalContextPath(selectedPolo, selectedBuilding, selectedFloor);

                const canUseShortLink = Boolean(
                    shortLinkContext &&
                    shortLinkContext.code &&
                    shortLinkContext.polo === selectedPolo &&
                    shortLinkContext.building === selectedBuilding &&
                    shortLinkContext.floor === selectedFloor
                );

                // Coordinate correnti del viewport (se abilitato)
                const coordParams = new URLSearchParams();
                if (settingsConfig.shareCoordinates && viewer && viewer.isOpen()) {
                    try {
                        const tiledImage = viewer.world.getItemAt(0);
                        if (tiledImage) {
                            const center = viewer.viewport.getCenter();
                            const imagePoint = tiledImage.viewportToImageCoordinates(center);
                            const contentSize = tiledImage.source.dimensions;
                            const x = imagePoint.x;
                            const y = contentSize.y - imagePoint.y;
                            const z = tiledImage.viewportToImageZoom(viewer.viewport.getZoom());
                            coordParams.set('x', x.toFixed(2));
                            coordParams.set('y', y.toFixed(2));
                            coordParams.set('z', z.toFixed(2));
                        }
                    } catch (e) {
                        // viewer non pronto, skip
                    }
                }

                let newUrl;

                if (canUseShortLink) {
                    if (shortLinkContext.canonicalRoomPage && shortLinkContext.canonicalPath) {
                        // Pagina canonica stanza: le coordinate sono fisse, non serve aggiungerle
                        newUrl = shortLinkContext.canonicalPath;
                    } else {
                        const params = new URLSearchParams();
                        params.set('c', shortLinkContext.code);
                        for (const [k, v] of coordParams) params.set(k, v);
                        const queryBasePath = shortLinkContext.queryBasePath || contextPath || appIndexPath;
                        newUrl = `${queryBasePath}?${params.toString()}`;
                    }
                } else {
                    newUrl = contextPath || appIndexPath;
                    const coordStr = coordParams.toString();
                    if (coordStr) {
                        newUrl += (newUrl.includes('?') ? '&' : '?') + coordStr;
                    }
                }

                const state = { polo: selectedPolo, building: selectedBuilding, floor: selectedFloor, view: currentView };

                if (replace) {
                    history.replaceState(state, '', newUrl);
                } else {
                    history.pushState(state, '', newUrl);
                }

                // Update page title dynamically
                const roomName = shortLinkContext?.polo === selectedPolo ? (shortLinkContext?.roomName ?? null) : null;
                const buildingAlias = selectedBuilding ? data?.polo?.[selectedPolo]?.edificio?.[selectedBuilding]?.alias?.[0] : null;
                const poloDisplay = buildingAlias || `Polo ${selectedPolo.charAt(0).toUpperCase() + selectedPolo.slice(1)}`;
                document.title = roomName ? `${roomName} | DOVE?UNIPI` : `${poloDisplay} | DOVE?UNIPI`;
            }

            function findRoomByShortCode(poloName, code) {
                if (!code || !data.polo || !data.polo[poloName]) return null;

                const normalizedInput = normalizeShortCode(code);
                if (!normalizedInput) return null;

                const allRooms = getAllRoomsInPolo(poloName);

                // First, try to find a person by normalized name
                // This handles the new person-based short links (e.g., ?c=priamicorrado)
                for (const item of allRooms) {
                    const room = item.room;

                    // Check if this is a persona type
                    const isPersona = Array.isArray(room.type)
                        ? room.type.includes('persona')
                        : room.type === 'persona';

                    if (isPersona) {
                        const namesField = room.nome;
                        let personNames = [];

                        if (Array.isArray(namesField)) {
                            personNames = namesField;
                        } else if (typeof namesField === 'string') {
                            personNames = [namesField];
                        }

                        // Check if any of the person names match the normalized input
                        for (const name of personNames) {
                            if (normalizeShortCode(name) === normalizedInput) {
                                // Found a match! Return this room with the specific person name
                                return {
                                    ...item,
                                    matchedPersonName: name
                                };
                            }
                        }
                    }
                }

                // If no person match found, fall back to room-based search
                // Parse code to separate base and index
                // Format: name or name-2, name-3, etc.
                let baseCode = normalizedInput;
                let targetIndex = 0;

                // Check for suffix -N where N is a number
                const match = normalizedInput.match(/^(.*)-(\d+)$/);
                if (match) {
                    baseCode = match[1];
                    targetIndex = parseInt(match[2], 10) - 1; // Convert 2 -> index 1
                }

                // Find all rooms matching the base code
                const matchingRooms = allRooms.filter(item => {
                    const itemBaseCode = getRoomBaseShortCode(item.room);
                    return itemBaseCode === baseCode;
                });

                if (matchingRooms.length > targetIndex) {
                    return matchingRooms[targetIndex];
                }

                // Fallback: try exact match against original code (legacy behavior or edge cases)
                // This might be needed if a room literally has a name like "lab-2"
                // But getRoomBaseShortCode normalizes names, so "lab-2" would be base code "lab-2"
                // If we didn't find it with the split logic, maybe it was a direct match?
                // Actually, the split logic is safer for the new system. 
                // Let's keep a fallback search just in case the splitting was wrong 
                // (e.g. room name is literally "room-2" and it's the first one)

                // If we didn't find anything with the suffix logic, try to find exact match 
                // treating the whole input as the base code
                if (match) {
                    const exactMatches = allRooms.filter(item => {
                        const itemBaseCode = getRoomBaseShortCode(item.room);
                        return itemBaseCode === normalizedInput;
                    });
                    if (exactMatches.length > 0) return exactMatches[0];
                }

                return null;
            }

            // Funzione per gestire il caricamento iniziale basato sull'URL
            function handleInitialLoad() {
                const params = new URLSearchParams(window.location.search);
                const poloParam = params.get('p') || params.get('polo');
                let buildingParam = params.get('b') || params.get('edificio');
                let floorParam = params.get('f') || params.get('piano');
                const roomParam = params.get('c');
                const viewParam = params.get('v');
                const viewParams = {
                    x: params.get('x'),
                    y: params.get('y'),
                    z: params.get('z')
                };

                const polos = Object.keys(data.polo);
                if (polos.length === 0) return;

                let poloToSelect = poloParam && data.polo[poloParam] ? poloParam : polos[0];
                let roomFromShortLink = null;
        const staticContextState = window.__DOVE_STATIC_CONTEXT__;
        const staticRoomState = window.__DOVE_STATIC_ROOM__;
        let useStaticRoomBootstrap = false;

        if (staticContextState?.polo && staticContextState?.pageType) {
          poloToSelect = staticContextState.polo;
          buildingParam = staticContextState.building ?? buildingParam;
          floorParam = staticContextState.floor ?? floorParam;

          setCanonicalContextOverride({
            pageType: staticContextState.pageType,
            polo: staticContextState.polo,
            building: staticContextState.building ?? null,
            floor: staticContextState.floor ?? null,
            path: staticContextState.canonicalPath || null
          });

          if (staticContextState.pageType === 'detail' && staticContextState.detail) {
            const staticDetail = findStaticDetailOnFloor(
              staticContextState.polo,
              staticContextState.building,
              String(staticContextState.floor),
              staticContextState.detail.id || null,
              staticContextState.detail.slug || null
            );

            if (staticDetail) {
              useStaticRoomBootstrap = true;
              buildingParam = staticDetail.edificio;
              floorParam = staticDetail.piano;
              roomFromShortLink = staticDetail;
              setShortLinkContext({
                polo: poloToSelect,
                building: buildingParam,
                floor: floorParam,
                room: staticDetail.room
              });
            }
          }
        }

        if (!roomFromShortLink && staticRoomState?.polo && staticRoomState?.building != null && staticRoomState?.floor != null && (staticRoomState?.roomId || staticRoomState?.slug)) {
          const staticRoom = findRoomById(
            staticRoomState.polo,
            staticRoomState.building,
            String(staticRoomState.floor),
            staticRoomState.roomId
          );

          if (staticRoom) {
            useStaticRoomBootstrap = true;
            poloToSelect = staticRoomState.polo;
            buildingParam = staticRoom.edificio;
            floorParam = staticRoom.piano;
            roomFromShortLink = staticRoom;
            setShortLinkContext({
              polo: poloToSelect,
              building: buildingParam,
              floor: floorParam,
              room: staticRoom.room
            });
          }
        }

        if (!roomFromShortLink && roomParam) {
                    roomFromShortLink = findRoomByShortCode(poloToSelect, roomParam);

                    if (!roomFromShortLink && poloParam && data.polo[poloParam]) {
                        roomFromShortLink = findRoomByShortCode(poloParam, roomParam);
                        if (roomFromShortLink) {
                            poloToSelect = poloParam;
                        }
                    }

                    if (!roomFromShortLink) {
                        for (const poloName of polos) {
                            if (roomFromShortLink) break;
                            const lookup = findRoomByShortCode(poloName, roomParam);
                            if (lookup) {
                                roomFromShortLink = lookup;
                                poloToSelect = poloName;
                            }
                        }
                    }

                    if (roomFromShortLink) {
                        buildingParam = roomFromShortLink.edificio;
                        floorParam = roomFromShortLink.piano;
                        setShortLinkContext({
                            polo: poloToSelect,
                            building: buildingParam,
                            floor: floorParam,
                            room: roomFromShortLink.room,
                            codeOverride: roomParam
                        });

                        // Popola automaticamente il campo di ricerca con il nome della persona o dell'aula
                        // Use ricerca field for consistent display
                        const displayName = roomFromShortLink.room.ricerca || roomFromShortLink.matchedPersonName || roomFromShortLink.room.nome || roomParam;
                        const searchQuery = `${displayName}`;

                        if (searchInput) searchInput.value = searchQuery;
                        if (searchInputMobile) searchInputMobile.value = searchQuery;

                        // Triggerare la ricerca per mostrare i risultati
                        searchRooms(searchQuery);
                    }
                }

                // Applica coordinate se il contesto è noto (da URL o da static bootstrap)
                // e non siamo su una pagina detail con bootstrap stanza (che ha posizione fissa)
                const hasExplicitContext = !useStaticRoomBootstrap && buildingParam && floorParam;
                const effectiveViewParams = hasExplicitContext ? viewParams : null;
                const effectiveViewParam = useStaticRoomBootstrap ? null : viewParam;

                // Passa i parametri dell'edificio, del piano e della vista
                selectPolo(
                    poloToSelect,
                    buildingParam,
                    floorParam,
                    effectiveViewParams,
                  effectiveViewParam,
                    roomFromShortLink ? roomFromShortLink.room : null
                );

                // Espandi automaticamente i dettagli dell'aula nella sidebar se proveniamo da un link breve
                if (roomFromShortLink) {
                    setTimeout(() => {
                        expandRoomDetailsInSidebar(roomFromShortLink.room);
                    }, 200);

                    // Anima il bottone della sidebar per invogliare l'utente ad aprirla
                    triggerSidebarButtonAnimation();
                } else {
                    searchRooms('');
                }
            }

            // Funzione per chiudere la sidebar (logica unificata)
            function closeSidebar() {
                sidebar.classList.add('-translate-x-full');
                hideTooltip();
                if (document.activeElement instanceof HTMLElement) {
                    document.activeElement.blur();
                }
            }


            // Funzione per aprire la sidebar (logica unificata)
            function openSidebar() {
                sidebar.classList.remove('-translate-x-full');
                hideTooltip();
                if (document.activeElement instanceof HTMLElement) {
                    document.activeElement.blur();
                }
            }

            // Funzione per animare il bottone della sidebar come feedback visivo
            function triggerSidebarButtonAnimation() {
                // Controlla se la sidebar è chiusa prima di animare
                if (sidebar.classList.contains('-translate-x-full')) {
                    openSidebarBtn.classList.add('pulse-animation');

                    // Rimuovi la classe dopo l'animazione per permettere animazioni future
                    setTimeout(() => {
                        openSidebarBtn.classList.remove('pulse-animation');
                    }, 1200); // 0.6s * 2 ripetizioni = 1.2s
                }
            }

            // Event Listener per il bottone Apri
            openSidebarBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openSidebar();
            });

            // Event Listener per il bottone Chiudi
            closeSidebarBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                closeSidebar();
            });

            // Aggiungi un listener per chiudere la sidebar se si clicca fuori
            document.addEventListener('click', (e) => {
                // Controlla se il clic è fuori dalla sidebar E non è il bottone apria
                if (!sidebar.contains(e.target) && e.target !== openSidebarBtn && !openSidebarBtn.contains(e.target)) {
                    // Solo se la sidebar è attualmente aperta (non ha -translate-x-full)
                    if (!sidebar.classList.contains('-translate-x-full')) {
                        closeSidebar();
                    }
                }
            });

            // Listener per i nuovi bottoni di zoom
            zoomInBtn.addEventListener('click', () => {
                clearShortLinkContext();
                if (viewer) {
                    viewer.viewport.zoomBy(1.2);
                    viewer.viewport.applyConstraints();
                }
            });

            zoomOutBtn.addEventListener('click', () => {
                clearShortLinkContext();
                if (viewer) {
                    viewer.viewport.zoomBy(0.8);
                    viewer.viewport.applyConstraints();
                }
            });

            resetZoomBtn.addEventListener('click', () => {
                clearShortLinkContext();
                if (viewer) {
                    markProgrammaticMapChange();
                    viewer.viewport.goHome();
                }
            });


            if (flipViewBtn) {
                flipViewBtn.addEventListener('click', () => {
                    clearShortLinkContext();
                    setMapFlipState(!isMapFlipped);
                });
            }

            // Rileva se è un dispositivo touch reale (mobile/tablet)
            function isTouchDevice() {
                return (
                    ('ontouchstart' in window) ||
                    (navigator.maxTouchPoints > 0) ||
                    (navigator.msMaxTouchPoints > 0)
                );
            }

            // Rileva se la finestra è piccola (mobile layout)
            function isMobile() {
                return window.innerWidth <= 1200;
            }

            // Rileva se è un vero dispositivo mobile (touch + piccolo schermo)
            function isRealMobileDevice() {
                return isTouchDevice() && isMobile();
            }

            function precalculateShortCodes() {
                if (!data || !data.polo) return;

                Object.keys(data.polo).forEach(poloName => {
                    const allRooms = getAllRoomsInPolo(poloName);

                    // Group by base code
                    const roomsByBaseCode = {};

                    allRooms.forEach(item => {
                        const baseCode = getRoomBaseShortCode(item.room);
                        if (baseCode) {
                            if (!roomsByBaseCode[baseCode]) {
                                roomsByBaseCode[baseCode] = [];
                            }
                            roomsByBaseCode[baseCode].push(item.room);
                        }
                    });

                    // Assign codes
                    Object.keys(roomsByBaseCode).forEach(baseCode => {
                        const rooms = roomsByBaseCode[baseCode];
                        if (rooms.length === 1) {
                            rooms[0].calculatedShortCode = baseCode;
                        } else {
                            rooms.forEach((room, index) => {
                                if (index === 0) {
                                    room.calculatedShortCode = baseCode;
                                } else {
                                    room.calculatedShortCode = `${baseCode}-${index + 1}`;
                                }
                            });
                        }
                    });
                });
            }

            // Carica le traduzioni e i dati delle stanze in parallelo
            let dataLoaded = false;

            async function loadDataAndInitialize() {
                const translationsPromise = ensureTranslationsLoaded();
                if (dataLoaded) return;

                const UNIFIED_CACHE_KEY = 'dove_unipi_unified_data_v1';
                let loadedFromCache = false;
                let bootstrapFromCache = false;

                // Kick off network fetch immediately (runs in parallel with translations)
                const networkFetchPromise = (async () => {
                    const response = await fetch(`${getSiteRootPath()}data/unified.json?v=1.0.1`);
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    const unifiedJson = await response.json();
                    return unifiedJson;
                })();

                // Carica biblioteche.json in parallelo
                fetch(`${getSiteRootPath()}data/biblioteche.json`)
                    .then(r => r.ok ? r.json() : [])
                    .then(json => { biblioteche = Array.isArray(json) ? json : []; })
                    .catch(() => { biblioteche = []; });

                // 1. Tentativo caricamento da cache
                try {
                    const cachedUnified = localStorage.getItem(UNIFIED_CACHE_KEY);

                    if (cachedUnified) {
                        const parsed = JSON.parse(cachedUnified);

                        data = parsed;

                        dataLoaded = true;
                        loadedFromCache = true;
                        bootstrapFromCache = true;
                        console.log('Dati caricati dalla cache');
                    }
                } catch (e) {
                    console.warn('Errore lettura cache:', e);
                }

                // Ensure translations ready before touching UI
                await translationsPromise;

                if (bootstrapFromCache) {
                    populatePolos(Object.keys(data.polo));
                    handleInitialLoad();
                }

                // 2. Fetch dati aggiornati (already in flight)
                try {
                    const unifiedJson = await networkFetchPromise;

                    // Calcola short codes sui nuovi dati
                    // Usiamo un trucco per usare la funzione esistente che dipende da 'data' globale
                    const currentData = data;
                    data = unifiedJson;
                    precalculateShortCodes();

                    try {
                        localStorage.setItem(UNIFIED_CACHE_KEY, JSON.stringify(unifiedJson));
                    } catch (e) {
                        console.warn('Quota storage superata:', e);
                    }

                    if (!loadedFromCache) {
                        dataLoaded = true;
                        populatePolos(Object.keys(data.polo));
                        handleInitialLoad();
                    } else {
                        data = currentData; // Ripristina per coerenza UI sessione corrente
                        // Aggiorniamo comunque i dati in memoria per le navigazioni future senza reload
                        console.log('Cache aggiornata');
                    }
                } catch (error) {
                    console.error('Failed to load rooms data:', error);
                }
            }

            // Global variable for peopleData moved to top


            // Avvia il caricamento
            loadDataAndInitialize();

            function populatePolos(polos) {
                polosList.innerHTML = '';
                polos.forEach(polo => {
                    const button = document.createElement('button');
                    button.className = 'nav-item flex flex-col items-start p-2 rounded-lg w-full text-left';
                    
                    // Add polo title
                    const titleSpan = document.createElement('span');
                    titleSpan.textContent = `Polo ${polo.charAt(0).toUpperCase() + polo.slice(1)}`;
                    titleSpan.className = 'mb-2'; // Margin bottom for spacing
                    button.appendChild(titleSpan);
                    
                    // Create container for mini-map SVG
                    const miniMapContainer = document.createElement('div');
                    miniMapContainer.className = 'w-full mini-map-container';
                    miniMapContainer.style.maxHeight = '120px';
                    miniMapContainer.dataset.polo = polo;
                    
                    // Try to load the mini-map SVG (only if the polo config declares it)
                    const poloConfig = data?.polo?.[polo];
                    if (poloConfig?.miniMap) {
                        const miniMapPath = `${getSiteRootPath()}polo/${polo}/mini-map.svg`;
                        fetch(miniMapPath)
                            .then(response => {
                                if (!response.ok) throw new Error('SVG not found');
                                return response.text();
                            })
                            .then(svgText => {
                                miniMapContainer.innerHTML = svgText;
                                const svg = miniMapContainer.querySelector('svg');
                                if (svg) {
                                    svg.style.width = '100%';
                                    svg.style.height = 'auto';
                                    svg.style.maxHeight = '120px';
                                    svg.classList.add('mini-map-svg');
                                    svg.dataset.polo = polo;

                                    // Update state for this polo
                                    if (polo === selectedPolo) {
                                        updateMiniMapState();
                                    } else {
                                        // Dim all buildings for non-selected polos
                                        setMiniMapHighlight(polo, null);
                                    }
                                }
                            })
                            .catch(() => {
                                miniMapContainer.remove();
                                titleSpan.classList.remove('mb-2');
                            });

                        button.appendChild(miniMapContainer);
                    } else {
                        titleSpan.classList.remove('mb-2');
                    }
                    
                    button.addEventListener('click', () => {
                        clearShortLinkContext();
                      setCanonicalContextOverride({
                        pageType: 'polo',
                        polo,
                        path: buildCanonicalPoloPath(polo)
                      });
                        selectPolo(polo);
                    });
                    polosList.appendChild(button);
                });
            }
            
            // Efficiently handles mini-map rotation with caching
            function setMiniMapRotation(polo, shouldFlip) {
                const svg = document.querySelector(`.mini-map-svg[data-polo="${polo}"]`);
                if (!svg) return;

                // Cache rotation data on the element to avoid repeated regex parsing
                if (!svg._rotationData) {
                    const group = svg.querySelector('g[transform*="rotate"]');
                    if (!group) return;
                    
                    const match = group.getAttribute('transform').match(/rotate\(([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\)/);
                    if (!match) return;

                    // Cache text elements that need counter-rotation
                    const texts = Array.from(svg.querySelectorAll('text[transform*="rotate"]')).map(t => {
                        const tm = t.getAttribute('transform').match(/rotate\(([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\)/);
                        return tm ? { el: t, base: parseFloat(tm[1]), cx: tm[2], cy: tm[3] } : null;
                    }).filter(Boolean);

                    svg._rotationData = {
                        group,
                        base: parseFloat(match[1]),
                        cx: match[2],
                        cy: match[3],
                        texts
                    };
                }

                const { group, base, cx, cy, texts } = svg._rotationData;
                
                // Logic: flipped = 0deg, normal = base rotation
                const targetRot = shouldFlip ? 0 : base;
                group.setAttribute('transform', `rotate(${targetRot}, ${cx}, ${cy})`);

                // Update texts
                texts.forEach(t => {
                    const tRot = shouldFlip ? 0 : t.base;
                    t.el.setAttribute('transform', `rotate(${tRot}, ${t.cx}, ${t.cy})`);
                });
            }

            // Highlights the selected building in the mini-map and dims others
            function setMiniMapHighlight(polo, building) {
                const svg = document.querySelector(`.mini-map-svg[data-polo="${polo}"]`);
                if (!svg) return;

                // Find all building groups (ids starting with Edificio_)
                const groups = svg.querySelectorAll('g[id^="Edificio_"]');
                
                groups.forEach(group => {
                    const id = group.id; // e.g., "Edificio_A"
                    // Extract letter: "Edificio_A" -> "a"
                    const buildingLetter = id.replace(/^Edificio_/i, '').toLowerCase();
                    
                    if (!building) {
                        // No building selected: dim all buildings
                        group.classList.add('mini-map-building-dimmed');
                        group.classList.remove('mini-map-building-selected');
                        group.style.transition = 'opacity 0.3s ease';
                    } else if (buildingLetter === building.toLowerCase()) {
                        group.classList.remove('mini-map-building-dimmed');
                        group.classList.add('mini-map-building-selected');
                        group.style.transition = 'opacity 0.3s ease';
                    } else {
                        group.classList.add('mini-map-building-dimmed');
                        group.classList.remove('mini-map-building-selected');
                        group.style.transition = 'opacity 0.3s ease';
                    }
                });
            }

            // Centralized state manager
            function updateMiniMapState() {
                if (!selectedPolo) return;
                
                const building = selectedBuilding;
                // Check if rotation is actually active/supported for current view
                const supportsRotation = building && 
                                        data.polo[selectedPolo]?.edificio[building]?.rotate;
                
                const shouldBeFlipped = supportsRotation && isMapFlipped;
                
                setMiniMapRotation(selectedPolo, shouldBeFlipped);
                
                // Highlight the selected building for the current polo
                setMiniMapHighlight(selectedPolo, building);
                
                // Reset highlights on all other polos' mini-maps
                document.querySelectorAll('.mini-map-svg').forEach(svg => {
                    if (svg.dataset.polo !== selectedPolo) {
                        setMiniMapHighlight(svg.dataset.polo, null);
                    }
                });
            }

            function isSingleBuildingPolo(polo) {
                const edificio = data.polo[polo]?.edificio;
                if (!edificio) return false;
                const keys = Object.keys(edificio);
                return keys.length === 1 && keys[0] === '';
            }

            function selectPolo(polo, buildingToSelect = null, floorToSelect = null, viewParams = null, viewToSelect = null, roomData = null) {
                selectedPolo = polo;
                const buildings = Object.keys(data.polo[polo].edificio);
                const singleBuilding = isSingleBuildingPolo(polo);

                // Show/hide buildings section for single-building polos
                const buildingsSection = document.getElementById('buildings-section');
                if (buildingsSection) {
                    buildingsSection.style.display = singleBuilding ? 'none' : '';
                }

                if (!singleBuilding) {
                    populateBuildings(buildings);
                } else {
                    buildingsList.innerHTML = '';
                }

                // Aggiorna lo stile dei bottoni dei poli
                Array.from(polosList.children).forEach(child => {
                    const poloName = child.querySelector('span').textContent.split(' ')[1].toLowerCase();
                    if (poloName === polo) {
                        child.classList.add('selected');
                    } else {
                        child.classList.remove('selected');
                    }
                });

                if (buildings.length > 0) {
                    const building = buildingToSelect && buildings.includes(buildingToSelect) ? buildingToSelect : buildings[0];
                    selectBuilding(building, floorToSelect, viewParams, viewToSelect, roomData);
                } else {
                    floorsList.innerHTML = '';
                    roomsList.innerHTML = '';
                    viewerContainer.innerHTML = `<p class="p-2 text-gray-500">${t('no_buildings_message')}</p>`;
                }
            }

            function populateBuildings(buildings) {
                buildingsList.innerHTML = '';
                buildings.forEach(building => {
                    const button = document.createElement('button');
                    button.className = 'nav-item w-full text-left flex items-center space-x-3 p-2 pl-6 rounded-lg';
                    button.dataset.building = building;

                    const buildingData = data.polo[selectedPolo]?.edificio?.[building];
                    const aliases = buildingData?.alias;
                    const aliasHTML = aliases && aliases.length > 0
                        ? `<span style="display: block; font-size: 0.75em; opacity: 0.6; margin-top: 1px; line-height: 1.2;">${aliases.join(' · ')}</span>`
                        : '';

                    button.innerHTML = `
                        <span>${t('building')} ${building.toUpperCase()}${aliasHTML}</span>
                    `;
                    button.addEventListener('click', () => {
                        clearShortLinkContext();
                      setCanonicalContextOverride({
                        pageType: 'building',
                        polo: selectedPolo,
                        building,
                        path: buildCanonicalBuildingPath(selectedPolo, building)
                      });
                        selectBuilding(building);
                    });
                    buildingsList.appendChild(button);
                });
            }

            function populateFloors(building) {
                const floors = Object.keys(data.polo[selectedPolo].edificio[building].piano).sort((a, b) => a - b);
                floorsList.innerHTML = '';
                floors.forEach(floor => {
                    const button = document.createElement('button');
                    button.className = 'nav-item w-full text-left flex items-center space-x-3 p-2 pl-6 rounded-lg';
                    button.dataset.floor = floor;
                    button.innerHTML = `
                        <span>${floor === '0' && settingsConfig.showGroundFloor ? t('floor_ground') : t('floor') + ' ' + floor}</span>
                    `;
                    button.addEventListener('click', () => {
                        clearShortLinkContext();
                      setCanonicalContextOverride({
                        pageType: 'floor',
                        polo: selectedPolo,
                        building: selectedBuilding,
                        floor,
                        path: buildCanonicalFloorPath(selectedPolo, selectedBuilding, floor)
                      });
                        selectFloor(floor);
                    });
                    floorsList.appendChild(button);
                });
            }

            // Helper function to check if a room has a specific type (supports string or array)
            function roomHasType(room, typeToCheck) {
                if (!room.type) return false;
                if (Array.isArray(room.type)) {
                    return room.type.includes(typeToCheck);
                }
                return room.type === typeToCheck;
            }

            // Helper function to check if a room has ONLY studio type (no other types)
            function hasOnlyStudioType(room) {
                if (room.type === 'studio') return true;
                if (Array.isArray(room.type)) {
                    return room.type.length === 1 && room.type[0] === 'studio';
                }
                return false;
            }

            function populateRooms(building, floor) {
                const roomsTitleElement = document.getElementById('rooms-title');
                const roomsListParent = roomsList.parentElement;

                const floorData = data.polo[selectedPolo].edificio[building]?.piano[floor];

                // Gestisce entrambe le strutture dati: array di aule o oggetto con chiave 'aule'
                const rooms = Array.isArray(floorData) ? floorData : (floorData?.aule ? Object.values(floorData.aule) : []);

                // Recupera i dipartimenti definiti a livello di edificio (se presenti)
                const buildingData = data.polo[selectedPolo].edificio[building];
                const buildingDepartments = buildingData?.dipartimenti || [];

                // Unisci i dipartimenti del piano con quelli dell'edificio
                // Filtra le stanze del piano per trovare i dipartimenti, poi aggiungi quelli dell'edificio
                const floorDepartments = rooms.filter(room => roomHasType(room, 'dipartimento'));
                const departments = [...floorDepartments, ...buildingDepartments];
                const libraries = rooms.filter(room => roomHasType(room, 'biblioteca'));
                const studyRooms = rooms.filter(room => roomHasType(room, 'studio'));
                const laboratories = rooms.filter(room => roomHasType(room, 'laboratorio'));

                // Filter for Sale (Meeting Rooms) and active Aule (Classrooms)
                // First get everything that is NOT a special type (dept, lib, studio-only, lab, person, dispenser)
                const allRegularRooms = rooms.filter(room =>
                    !roomHasType(room, 'dipartimento') &&
                    !roomHasType(room, 'biblioteca') &&
                    !hasOnlyStudioType(room) &&
                    !roomHasType(room, 'laboratorio') &&
                    !roomHasType(room, 'persona') &&
                    !roomHasType(room, 'erogatore_acqua')
                );

                const sale = allRegularRooms.filter(room => roomHasType(room, 'sala'));
                const aule = allRegularRooms.filter(room => !roomHasType(room, 'sala'));

                // Rimuovi eventuali elementi temporanei precedenti
                const oldDeptHeader = document.getElementById('temp-dept-header');
                if (oldDeptHeader) oldDeptHeader.remove();
                const oldDeptContainer = document.getElementById('temp-dept-container');
                if (oldDeptContainer) oldDeptContainer.remove();

                const oldLibHeader = document.getElementById('temp-lib-header');
                if (oldLibHeader) oldLibHeader.remove();
                const oldLibContainer = document.getElementById('temp-lib-container');
                if (oldLibContainer) oldLibContainer.remove();

                const oldStudyHeader = document.getElementById('temp-study-header');
                if (oldStudyHeader) oldStudyHeader.remove();
                const oldStudyContainer = document.getElementById('temp-study-container');
                if (oldStudyContainer) oldStudyContainer.remove();

                const oldSaleHeader = document.getElementById('temp-sale-header');
                if (oldSaleHeader) oldSaleHeader.remove();
                const oldSaleContainer = document.getElementById('temp-sale-container');
                if (oldSaleContainer) oldSaleContainer.remove();

                const oldLabHeader = document.getElementById('temp-lab-header');
                if (oldLabHeader) oldLabHeader.remove();
                const oldLabContainer = document.getElementById('temp-lab-container');
                if (oldLabContainer) oldLabContainer.remove();

                const oldPeopleHeader = document.getElementById('temp-people-header');
                if (oldPeopleHeader) oldPeopleHeader.remove();
                const oldPeopleContainer = document.getElementById('temp-people-container');
                if (oldPeopleContainer) oldPeopleContainer.remove();


                // --- Helper Function to Render Room Item ---
                function createRoomItem(room, iconName = 'door_front') {
                    const roomContainer = document.createElement('div');
                    roomContainer.className = 'nav-item-container';

                    const roomElement = document.createElement('a');
                    roomElement.href = '#';
                    roomElement.className = 'nav-item w-full text-left flex items-center justify-between space-x-3 p-2 pl-6 rounded-lg';

                    const roomInfoElement = document.createElement('div');
                    let detailsCount = 0;
                    function addInfoRow(condition, icon, text) {
                        if (!condition) return false;
                        detailsCount++;
                        roomInfoElement.innerHTML += `
                            <div class="flex items-start space-x-2">
                                <span class="material-symbols-outlined mt-0.5" style="font-size: 16px; line-height: 1;">${icon}</span>
                                <span>${text.replace("%s", `${condition}`)}</span>
                            </div>
                        `;
                        return true;
                    }
                    roomInfoElement.className = 'capacity-info hidden pl-10 p-1 text-sm text-gray-600';

                    // Room number (first detail, especially important for people)
                    addInfoRow(room.room, "meeting_room", t('room_number'));

                    // Accessibility
                    addInfoRow(room.capienza, "group", t('room_detail_capacity'));
                    addInfoRow(room.accesso_disabili, "accessible_forward", t('room_detail_accessible'));
                    addInfoRow(room.accesso_disabili === false, "not_accessible_forward", t('room_detail_not_accessible'));

                    // For the student
                    addInfoRow(room.rete, "wifi", t('room_detail_network'));
                    addInfoRow(room.porte_rete, "lan", t('room_detail_network_ports'));
                    if (room.numero_prese_elettriche > 0) {
                        addInfoRow(room.numero_prese_elettriche, "bolt", t('room_detail_power_outlets_count'));
                    } else {
                        addInfoRow(room.prese_elettriche, "bolt", t('room_detail_power_outlets'));
                    }

                    // Both - functionality / lab
                    if (!addInfoRow(room.numero_pc, "computer", t('room_detail_computers_count')))
                        addInfoRow(room.presenza_pc, "computer", t('room_detail_computers')); // In case we don't know the amount

                    // For the professor
                    addInfoRow(room.proiettore, "cast", t('room_detail_projector'));
                    addInfoRow(room.altoparlanti, "speaker_group", t('room_detail_speakers'));
                    addInfoRow(room.telecamera, "speed_camera", t('room_detail_camera'));
                    addInfoRow(room.lavagna, "draw", t('room_detail_blackboard'))

                    // Check if there are any details to show
                    const hasDetails = detailsCount > 0;

                    // If no details, hide the expand icon
                    const expandIconStyle = hasDetails ? 'font-size: 20px; line-height: 1; transition: transform 0.2s;' : 'display: none;';

                    // Store data attributes for delegation
                    roomElement.dataset.roomName = room.nome;
                    // We need current context (polo, building, floor)
                    // These are available in populateRooms closure
                    roomElement.dataset.polo = selectedPolo;
                    roomElement.dataset.building = building;
                    roomElement.dataset.floor = floor;

                    // Optimization: Add ID for O(1) lookup
                    if (room.id) {
                        roomElement.id = `sidebar-item-${room.id}`;
                    }

                    roomElement.innerHTML = `
                        <span class="flex items-center space-x-3 pointer-events-none">
                            <span>${room.nome}</span>
                        </span>
                        <span class="material-symbols-outlined expand-icon pointer-events-none" style="${expandIconStyle}">
                            expand_more
                        </span>
                    `;

                    // REMOVED ADDEVENTLISTENER

                    roomContainer.appendChild(roomElement);
                    roomContainer.appendChild(roomInfoElement);
                    return roomContainer;
                }
                // ------------------------------------------

                // Se ci sono dipartimenti, crea una sezione dedicata PRIMA del titolo "Aule"
                if (departments.length > 0) {
                    // Crea header dipartimenti
                    const deptHeader = document.createElement('h3');
                    deptHeader.textContent = t('department_singular');
                    deptHeader.className = 'text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2';
                    deptHeader.id = 'temp-dept-header';

                    // Crea contenitore per i dipartimenti
                    const deptContainer = document.createElement('div');
                    deptContainer.id = 'temp-dept-container';
                    deptContainer.className = 'mb-4';

                    // Aggiungi i dipartimenti al contenitore dedicato
                    departments.forEach(dept => {
                        const deptElement = document.createElement('div');
                        deptElement.className = 'department-item w-full text-left p-2 pl-6';
                        deptElement.setAttribute('data-name', dept.nome);
                        deptElement.innerHTML = `<span>${dept.nome}</span>`;

                        const buttonsContainer = document.createElement('div');
                        buttonsContainer.className = 'flex space-x-2 mt-2';

                        if (dept['link-mappa']) {
                            const mapBtn = document.createElement('a');
                            mapBtn.href = dept['link-mappa'];
                            mapBtn.target = '_blank';
                            mapBtn.className = 'flex items-center space-x-2 p-2 bg-gray-300 rounded-lg hover:bg-[#b7bcc5] transition-colors';
                            mapBtn.innerHTML = `<span class="material-symbols-outlined" style="font-size: 16px;">map</span><span>${t('map_button')}</span>`;
                            buttonsContainer.appendChild(mapBtn);
                        }

                        if (dept['link-dipartimento']) {
                            const deptBtn = document.createElement('a');
                            deptBtn.href = dept['link-dipartimento'];
                            deptBtn.target = '_blank';
                            deptBtn.className = 'flex items-center space-x-2 p-2 bg-gray-300 rounded-lg hover:bg-[#b7bcc5] transition-colors';
                            deptBtn.innerHTML = `<span class="material-symbols-outlined" style="font-size: 16px;">language</span><span>${t('website_button')}</span>`;
                            buttonsContainer.appendChild(deptBtn);
                        }

                        deptElement.appendChild(buttonsContainer);
                        deptContainer.appendChild(deptElement);
                    });

                    // Inserisci header e contenitore dipartimenti PRIMA del titolo "Aule"
                    roomsListParent.insertBefore(deptContainer, roomsTitleElement);
                    roomsListParent.insertBefore(deptHeader, deptContainer);
                }

                // Se ci sono biblioteche, crea una sezione dedicata
                if (libraries.length > 0) {
                    const libHeader = document.createElement('h3');
                    libHeader.textContent = t('library_title');
                    libHeader.className = 'text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2';
                    libHeader.id = 'temp-lib-header';

                    const libContainer = document.createElement('div');
                    libContainer.id = 'temp-lib-container';
                    libContainer.className = 'mb-4';

                    libraries.forEach(lib => {
                        const libContainerItem = document.createElement('div');
                        libContainerItem.className = 'nav-item-container mb-2';

                        // 1. Header (Toggle) - Solo nome e icona espansione
                        const libHeader = document.createElement('div');
                        libHeader.className = 'w-full text-left p-2 pl-6 rounded-lg cursor-pointer transition-colors flex items-center justify-between';

                        // Add data attributes for delegation
                        libHeader.dataset.roomName = lib.nome;
                        libHeader.dataset.polo = selectedPolo;
                        libHeader.dataset.building = building;
                        libHeader.dataset.floor = floor;

                        libHeader.innerHTML = `
                            <span class="font-medium pointer-events-none">${lib.nome}</span>
                            <span class="material-symbols-outlined expand-icon pointer-events-none" style="font-size: 20px; line-height: 1; transition: transform 0.2s;">
                                expand_more
                            </span>
                        `;

                        // 2. Website Button (Always Visible, Outside Toggle)
                        let buttonContainer = null;
                        if (lib.link_sito) {
                            buttonContainer = document.createElement('div');
                            buttonContainer.className = 'pl-6 mt-1 mb-2 flex space-x-2';

                            const linkBtn = document.createElement('a');
                            linkBtn.href = lib.link_sito;
                            linkBtn.target = '_blank';
                            // Stile identico a quello dei dipartimenti
                            linkBtn.className = 'flex items-center space-x-2 p-2 bg-gray-300 rounded-lg hover:bg-[#b7bcc5] transition-colors inline-flex text-gray-900';
                            linkBtn.innerHTML = `<span class="material-symbols-outlined" style="font-size: 16px;">language</span><span>${t('website_button')}</span>`;

                            // Bottone Orari
                            const hoursBtn = document.createElement('button');
                            hoursBtn.className = 'flex items-center space-x-2 p-2 bg-gray-300 rounded-lg hover:bg-[#b7bcc5] transition-colors inline-flex text-gray-900';
                            hoursBtn.innerHTML = `<span class="material-symbols-outlined pointer-events-none" style="font-size: 16px;">schedule</span><span class="pointer-events-none">${t('hours_button')}</span>`;

                            // Add data attribute for delegation
                            hoursBtn.dataset.action = 'show-schedule';
                            hoursBtn.dataset.libName = lib.nome;

                            // REMOVED ADDEVENTLISTENER

                            buttonContainer.appendChild(hoursBtn);
                            buttonContainer.appendChild(linkBtn);
                        }

                        // 3. Details (Hidden by default)
                        const roomInfoElement = document.createElement('div');
                        function addInfoRow(condition, icon, text) {
                            if (!condition) return false;
                            roomInfoElement.innerHTML += `
                                <div class="flex items-start space-x-2">
                                    <span class="material-symbols-outlined mt-0.5" style="font-size: 16px; line-height: 1;">${icon}</span>
                                    <span>${text.replace("%s", `${condition}`)}</span>
                                </div>
                            `;
                            return true;
                        }
                        roomInfoElement.className = 'capacity-info hidden pl-10 p-1 text-sm text-gray-600 mt-2';

                        addInfoRow(lib.capienza, "group", t('room_detail_capacity'));
                        addInfoRow(lib.accesso_disabili, "accessible_forward", t('room_detail_accessible'));
                        addInfoRow(lib.accesso_disabili === false, "not_accessible_forward", t('room_detail_not_accessible'));
                        addInfoRow(lib.rete, "wifi", t('room_detail_network'));
                        addInfoRow(lib.porte_rete, "lan", t('room_detail_network_ports'));
                        if (lib.numero_prese_elettriche > 0) {
                            addInfoRow(lib.numero_prese_elettriche, "bolt", t('room_detail_power_outlets_count'));
                        } else {
                            addInfoRow(lib.prese_elettriche, "bolt", t('room_detail_power_outlets'));
                        }
                        if (!addInfoRow(lib.numero_pc, "computer", t('room_detail_computers_count')))
                            addInfoRow(lib.presenza_pc, "computer", t('room_detail_computers'));
                        addInfoRow(lib.proiettore, "cast", t('room_detail_projector'));
                        addInfoRow(lib.altoparlanti, "speaker_group", t('room_detail_speakers'));
                        addInfoRow(lib.telecamera, "speed_camera", t('room_detail_camera'));
                        addInfoRow(lib.lavagna, "draw", t('room_detail_blackboard'));



                        libContainerItem.appendChild(libHeader);
                        if (buttonContainer) {
                            libContainerItem.appendChild(buttonContainer);
                        }
                        libContainerItem.appendChild(roomInfoElement);
                        libContainer.appendChild(libContainerItem);
                    });

                    roomsListParent.insertBefore(libContainer, roomsTitleElement);
                    roomsListParent.insertBefore(libHeader, libContainer);
                }

                // Se ci sono SALE, crea una sezione dedicata
                if (sale.length > 0) {
                    const saleHeader = document.createElement('h3');
                    saleHeader.textContent = currentLanguage === 'it' ? 'Sale' : 'Rooms'; // Using 'Rooms' for 'Sale' as translation, or maybe 'Halls'
                    saleHeader.className = 'text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2';
                    saleHeader.id = 'temp-sale-header';

                    const saleContainer = document.createElement('div');
                    saleContainer.id = 'temp-sale-container';
                    saleContainer.className = 'mb-4';

                    sale.forEach(room => {
                        // Use meeting_room icon for Sale
                        const roomItem = createRoomItem(room, 'meeting_room');
                        saleContainer.appendChild(roomItem);
                    });

                    roomsListParent.insertBefore(saleContainer, roomsTitleElement);
                    roomsListParent.insertBefore(saleHeader, saleContainer);
                }

                // Se ci sono aule studio, crea una sezione dedicata
                if (studyRooms.length > 0) {
                    const studyHeader = document.createElement('h3');
                    studyHeader.textContent = t('studio_rooms_title');
                    studyHeader.className = 'text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2';
                    studyHeader.id = 'temp-study-header';

                    const studyContainer = document.createElement('div');
                    studyContainer.id = 'temp-study-container';
                    studyContainer.className = 'mb-4';

                    studyRooms.forEach(studyRoom => {
                        const studyContainerItem = document.createElement('div');
                        studyContainerItem.className = 'nav-item-container';

                        // Header (Toggle) - Nome e icona espansione
                        const studyRoomHeader = document.createElement('a');
                        studyRoomHeader.href = '#';
                        studyRoomHeader.className = 'nav-item w-full text-left flex items-center justify-between space-x-3 p-2 pl-6 rounded-lg';

                        // Details (Hidden by default)
                        const roomInfoElement = document.createElement('div');
                        let detailsCount = 0;
                        function addInfoRow(condition, icon, text) {
                            if (!condition) return false;
                            detailsCount++;
                            roomInfoElement.innerHTML += `
                                <div class="flex items-start space-x-2">
                                    <span class="material-symbols-outlined mt-0.5" style="font-size: 16px; line-height: 1;">${icon}</span>
                                    <span>${text.replace("%s", `${condition}`)}</span>
                                </div>
                            `;
                            return true;
                        }
                        roomInfoElement.className = 'capacity-info hidden pl-10 p-1 text-sm text-gray-600';

                        addInfoRow(studyRoom.capienza, "group", t('room_detail_capacity'));
                        addInfoRow(studyRoom.accesso_disabili, "accessible_forward", t('room_detail_accessible'));
                        addInfoRow(studyRoom.accesso_disabili === false, "not_accessible_forward", t('room_detail_not_accessible'));
                        addInfoRow(studyRoom.rete, "wifi", t('room_detail_network'));
                        addInfoRow(studyRoom.porte_rete, "lan", t('room_detail_network_ports'));
                        if (studyRoom.numero_prese_elettriche > 0) {
                            addInfoRow(studyRoom.numero_prese_elettriche, "bolt", t('room_detail_power_outlets_count'));
                        } else {
                            addInfoRow(studyRoom.prese_elettriche, "bolt", t('room_detail_power_outlets'));
                        }
                        if (!addInfoRow(studyRoom.numero_pc, "computer", t('room_detail_computers_count')))
                            addInfoRow(studyRoom.presenza_pc, "computer", t('room_detail_computers'));
                        addInfoRow(studyRoom.proiettore, "cast", t('room_detail_projector'));
                        addInfoRow(studyRoom.altoparlanti, "speaker_group", t('room_detail_speakers'));
                        addInfoRow(studyRoom.telecamera, "speed_camera", t('room_detail_camera'));
                        addInfoRow(studyRoom.lavagna, "draw", t('room_detail_blackboard'));

                        // Check if there are any details to show
                        const hasDetails = detailsCount > 0;

                        // If no details, hide the expand icon
                        const expandIconStyle = hasDetails ? 'font-size: 20px; line-height: 1; transition: transform 0.2s;' : 'display: none;';

                        // Re-render header with correct icon visibility
                        studyRoomHeader.innerHTML = `
                            <span class="flex items-center space-x-3">
                                <span>${studyRoom.nome}</span>
                            </span>
                            <span class="material-symbols-outlined expand-icon" style="${expandIconStyle}">
                                expand_more
                            </span>
                        `;

                        // Click Listener on Header
                        studyRoomHeader.addEventListener('click', (e) => {
                            e.preventDefault();

                            // Determine if we are closing (if details are already visible)
                            const isClosing = roomInfoElement && !roomInfoElement.classList.contains('hidden');

                            // Logic for Short Link & Map Selection
                            if (isRoomEligibleForShortLink(studyRoom)) {
                                if (!isClosing) {
                                    setShortLinkContext({
                                        polo: selectedPolo,
                                        building: selectedBuilding,
                                        floor: selectedFloor,
                                        room: studyRoom
                                    });
                                    updateURL(true);
                                }
                                // If closing, do not update URL to avoid map reset
                            } else {
                                if (!isClosing) {
                                    clearShortLinkContext();
                                }
                            }

                            // Center map ONLY if we are OPENING details (not closing)
                            if (!isClosing) {
                                centerMapOnRoom(studyRoom);
                            } else {
                                clearSelectedRoomMarker();
                            }

                            // Defer heavy UI updates to next frame to allow animation to start smoothly
                            requestAnimationFrame(() => {
                                // Toggle delle informazioni dell'aula
                                if (hasDetails) {
                                    roomInfoElement.classList.toggle('hidden');
                                    const expandIcon = studyRoomHeader.querySelector('.expand-icon');
                                    if (expandIcon) {
                                        expandIcon.style.transform = roomInfoElement.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
                                    }
                                }
                            });
                        });

                        studyContainerItem.appendChild(studyRoomHeader);
                        studyContainerItem.appendChild(roomInfoElement);
                        studyContainer.appendChild(studyContainerItem);
                    });

                    roomsListParent.insertBefore(studyContainer, roomsTitleElement);
                    roomsListParent.insertBefore(studyHeader, studyContainer);
                }

                // Title for regular Aule
                if (roomsTitleElement) {
                    if (aule.length > 0) {
                        roomsTitleElement.textContent = t('rooms_title'); // "Aule"
                        roomsTitleElement.style.display = '';
                    } else {
                        roomsTitleElement.style.display = 'none';
                    }
                    roomsTitleElement.style.marginTop = '';
                }

                // Svuota la lista delle aule
                roomsList.innerHTML = '';

                // List regular rooms (Aule)
                aule.forEach(room => {
                    const roomContainer = createRoomItem(room, 'door_front');
                    roomsList.appendChild(roomContainer);
                });

                // Se ci sono laboratori, crea una sezione dedicata IN FONDO
                if (laboratories.length > 0) {
                    const labHeader = document.createElement('h3');
                    labHeader.textContent = t('laboratories_title');
                    labHeader.className = 'text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2';
                    labHeader.id = 'temp-lab-header';

                    const labContainer = document.createElement('div');
                    labContainer.id = 'temp-lab-container';
                    labContainer.className = 'mb-4';

                    laboratories.forEach(lab => {
                        // Use science icon for Labs
                        const roomItem = createRoomItem(lab, 'science');
                        labContainer.appendChild(roomItem);
                    });

                    // Append after roomsList (in fondo)
                    // Verifichiamo se roomsList ha un parent, e appendiamo lì.
                    // Dato che gli altri usano insertBefore su roomsTitleElement, se noi facciamo appendChild su parent,
                    // dovrebbe finire dopo roomsList (che è l'ultimo elemento statico).
                    roomsListParent.appendChild(labHeader);
                    roomsListParent.appendChild(labContainer);
                }

                // Get people data for this floor
                const peopleList = (data?.polo?.[selectedPolo]?.edificio?.[selectedBuilding]?.piano?.[floor] || [])
                    .filter(item => item.type === 'persona');

                if (peopleList.length > 0) {
                    const peopleHeader = document.createElement('h3');
                    peopleHeader.textContent = t('people_title');
                    peopleHeader.className = 'text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2';
                    peopleHeader.id = 'temp-people-header';

                    const peopleContainer = document.createElement('div');
                    peopleContainer.id = 'temp-people-container';
                    peopleContainer.className = 'mb-4';

                    // Collect all individual entries (name + person object ref)
                    let allPeopleEntries = [];
                    peopleList.forEach(person => {
                        let names = [];
                        if (Array.isArray(person.nome)) {
                            names = person.nome;
                        } else if (typeof person.nome === 'string') {
                            names = person.nome.split(',').map(n => n.trim());
                        }

                        names.forEach(name => {
                            allPeopleEntries.push({
                                name: name,
                                personData: person
                            });
                        });
                    });

                    // Sort alphabetically by name
                    // Sort alphabetically by Surname (Cognome) then Name (Nome)
                    allPeopleEntries.sort((a, b) => {
                        const surnameA = (a.personData.cognome || "").toLowerCase();
                        const surnameB = (b.personData.cognome || "").toLowerCase();
                        if (surnameA < surnameB) return -1;
                        if (surnameA > surnameB) return 1;
                        
                        // If surnames are equal (or missing), sort by name
                        return a.name.localeCompare(b.name);
                    });

                    // Render sorted list
                    allPeopleEntries.forEach(entry => {
                        const personContainer = document.createElement('div');
                        personContainer.className = 'nav-item-container';

                        const personElement = document.createElement('a');
                        personElement.href = '#';
                        personElement.className = 'nav-item w-full text-left flex items-center justify-between space-x-3 p-2 pl-6 rounded-lg'; // Reduced padding for people

                        // Optimization: Add ID for O(1) lookup
                        if (entry.personData.id) {
                            personElement.id = `sidebar-item-${entry.personData.id}`;
                        }

                        // --- Details Construction ---
                        const personInfoElement = document.createElement('div');
                        let detailsCount = 0;
                        personInfoElement.className = 'capacity-info hidden pl-10 p-2 text-sm text-gray-600 space-y-2'; // Uniform spacing with space-y-2

                        // Helper for uniform rows
                        function addDetailRow(icon, contentHtml) {
                            detailsCount++;
                            personInfoElement.innerHTML += `
                                <div class="flex items-start space-x-2 min-w-0 w-full overflow-hidden">
                                     <span class="material-symbols-outlined shrink-0 mt-0.5" style="font-size: 16px; width: 16px; text-align: center;">${icon}</span>
                                     <span class="truncate block min-w-0 flex-1">${contentHtml}</span>
                                </div>`;
                        }

                        // 1. Category / Role (Carica/Categoria) - FIRST
                        const pData = entry.personData;
                        const category = pData.carica || pData.categoria; // Check both potential keys
                        
                        if (category) {
                           let categories = [];
                           if (Array.isArray(category)) {
                               categories = category;
                           } else if (typeof category === 'string') {
                               // Handle comma-separated string if it's not an array
                               categories = category.split(',').map(c => c.trim());
                           }

                           categories.forEach(cat => {
                               // Display each category on a new line with a label icon
                               addDetailRow('label', `<span class="font-medium text-gray-700">${cat}</span>`);
                           });
                        }

                        // 2. Contact Info (Email, Tel, Fax)
                        const pDataRef = entry.personData; // kept for compatibility if needed, but pData is defined above

                        // Room number first (most important for locating the person)
                        if (pData.room) {
                            addDetailRow('meeting_room', `<span>${t('room_number').replace('%s', pData.room)}</span>`);
                        }

                        // Email
                        if (pData.email) {
                            addDetailRow('mail', `<a href="mailto:${pData.email}" class="hover:underline truncate block" title="${pData.email}">${pData.email}</a>`);
                        }

                        // Phone
                        if (pData.tel) {
                            addDetailRow('call', `<a href="tel:${pData.tel.replace(/\s/g, '')}" class="hover:underline">${pData.tel}</a>`);
                        }

                        // Fax
                        if (pData.fax) {
                            addDetailRow('print', `<span>${pData.fax}</span>`);
                        }

                        // 2. Links (CV, Website, UniMap) - Now as uniform rows
                        if (pData.cv_link) {
                            addDetailRow('history_edu', `<a href="${pData.cv_link}" target="_blank" class="hover:underline">CV</a>`);
                        }

                        if (pData.url) {
                            addDetailRow('language', `<a href="${pData.url}" target="_blank" class="hover:underline">Sito Web</a>`);
                        }

                        if (pData.unimap_url) {
                            addDetailRow('link', `<a href="${pData.unimap_url}" target="_blank" class="hover:underline">UniMap</a>`);
                        }


                        const hasDetails = detailsCount > 0;
                        const expandIconStyle = hasDetails ? 'font-size: 20px; line-height: 1; transition: transform 0.2s;' : 'display: none;';

                        // Use Cognome if available, otherwise fallback to full name string
                        const surname = pData.cognome ? pData.cognome : "";
                        const firstName = pData.nome && typeof pData.nome === 'string' ? pData.nome : entry.name.replace(surname, "").trim(); 
                        
                        // If we have a structured surname/name, display them nicely
                        let nameHtml = "";
                        if (surname) {
                            nameHtml = `
                            <div class="flex flex-col">
                                <span class="leading-tight">${surname}</span>
                                <span class="text-sm text-gray-600 leading-tight">${firstName}</span>
                            </div>`;
                        } else {
                            // Fallback for unexpected data structure
                             nameHtml = `<span>${entry.name}</span>`;
                        }

                        personElement.innerHTML = `
                            <span class="flex items-center space-x-3 pointer-events-none">
                                ${nameHtml}
                            </span>
                            <span class="material-symbols-outlined expand-icon pointer-events-none" style="${expandIconStyle}">
                                expand_more
                            </span>
                        `;

                        personElement.addEventListener('click', (e) => {
                            e.preventDefault();

                            // Determine if we are closing (if details are already visible)
                            const isClosing = personInfoElement && !personInfoElement.classList.contains('hidden');

                            // Logic for Short Link & Map Selection
                            if (isRoomEligibleForShortLink(entry.personData)) {
                                if (!isClosing) {
                                    setShortLinkContext({
                                        polo: selectedPolo,
                                        building: selectedBuilding,
                                        floor: selectedFloor,
                                        room: entry.personData,
                                        codeOverride: normalizeShortCode(entry.personData.ricerca) // Use person ricerca for short code
                                    });
                                    updateURL(true);
                                }
                                // If closing, do not update URL to avoid map reset
                            } else {
                                if (!isClosing) {
                                    clearShortLinkContext();
                                }
                            }

                            // Center map ONLY if we are OPENING details (not closing)
                            if (!isClosing) {
                                centerMapOnRoom(entry.personData);
                            } else {
                                clearSelectedRoomMarker();
                            }

                            // Toggle Details Logic
                            requestAnimationFrame(() => {
                                if (hasDetails) {
                                    const isCurrentlyHidden = personInfoElement.classList.contains('hidden');
                                    personInfoElement.classList.toggle('hidden');
                                    const expandIcon = personElement.querySelector('.expand-icon');
                                    if (expandIcon) {
                                        expandIcon.style.transform = personInfoElement.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
                                    }

                                }
                            });
                        });

                        personContainer.appendChild(personElement);
                        personContainer.appendChild(personInfoElement);
                        peopleContainer.appendChild(personContainer);
                    });

                    roomsListParent.appendChild(peopleHeader);
                    roomsListParent.appendChild(peopleContainer);
                }
            }

            // Funzione per espandere automaticamente i dettagli dell'aula nella sidebar
            function expandRoomDetailsInSidebar(identifier) {
                if (!identifier) return;

                // Close all previously open details
                const allRoomInfos = roomsList.querySelectorAll('.capacity-info');
                const allExpandIcons = roomsList.querySelectorAll('.expand-icon');

                allRoomInfos.forEach(info => info.classList.add('hidden'));
                allExpandIcons.forEach(icon => icon.style.transform = 'rotate(0deg)');

                // Close details in temp containers (Libraries, Study Rooms, Labs, People)
                ['temp-lib-container', 'temp-study-container', 'temp-lab-container', 'temp-people-container'].forEach(containerId => {
                    const container = document.getElementById(containerId);
                    if (container) {
                        const infos = container.querySelectorAll('.capacity-info');
                        const icons = container.querySelectorAll('.expand-icon');
                        infos.forEach(info => info.classList.add('hidden'));
                        icons.forEach(icon => icon.style.transform = 'rotate(0deg)');
                    }
                });

                // Optimization: Try Direct ID Lookup First
                let targetElement = document.getElementById(`sidebar-item-${identifier}`);

                // If the identifier passed is the room name (legacy/fallback), it won't be found by ID directly.
                // Or if it's an object with an ID.
                if (!targetElement && typeof identifier === 'object' && identifier.id) {
                    targetElement = document.getElementById(`sidebar-item-${identifier.id}`);
                }

                if (targetElement) {
                    expandElementDetails(targetElement);
                    return; // Done! O(1) success.
                }

                // FALLBACK: Name-based lookup (Legacy / non-ID items)
                // Only needed if identifier is a string (name) and strict ID lookup failed.
                const roomName = typeof identifier === 'string' ? identifier : identifier.nome;
                if (!roomName) return;

                // Helper to match text content robustly
                const matchesName = (element, name) => {
                    const textSpan = element.querySelector('span.flex > span');
                    // Check strict equality first, then loose for safety
                    return textSpan && (textSpan.textContent.trim() === name || textSpan.textContent.trim().toLowerCase() === name.toLowerCase());
                };

                // Search in all potential lists
                const allNavItems = roomsList.parentElement.querySelectorAll('.nav-item, .department-item'); // Includi anche i dipartimenti!
                // Wait, roomsList.parentElement contains everything populated by populateRooms.

                // Iterate to find by name
                for (const element of allNavItems) {
                    if (matchesName(element, roomName) ||
                        // Check Department data-name
                        (element.classList.contains('department-item') && element.getAttribute('data-name') === roomName)) {

                        expandElementDetails(element);
                        return;
                    }
                }
            }

            // Helper function to handle the UI expansion of a found element
            function expandElementDetails(element) {
                const container = element.closest('.nav-item-container') || element.closest('.department-item') || element.parentElement;
                
                if (!container) return;

                const roomInfo = container.querySelector('.capacity-info');
                const expandIcon = element.querySelector('.expand-icon');

                if (roomInfo) {
                    roomInfo.classList.remove('hidden');
                    if (expandIcon) {
                        expandIcon.style.transform = 'rotate(180deg)';
                    }
                }

                setTimeout(() => {
                    element.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center',
                        inline: 'nearest'
                    });
                }, 100);
            }

            function selectBuilding(building, floorToSelect = null, viewParams = null, viewToSelect = null, roomData = null) {
                selectedBuilding = building;
                updateFlipButtonVisibility(building);
                populateFloors(building);

                // Aggiorna lo stile dei bottoni degli edifici
                Array.from(buildingsList.children).forEach(child => {
                    const bName = child.dataset.building;
                    if (bName === building) {
                        child.classList.add('selected');
                    } else {
                        child.classList.remove('selected');
                    }
                });

                const floors = Object.keys(data.polo[selectedPolo].edificio[building].piano).sort((a, b) => a - b);
                let floorToSet = '0'; // Default
                if (floorToSelect && floors.includes(floorToSelect)) {
                    floorToSet = floorToSelect;
                } else if (floors.includes('0')) {
                    floorToSet = '0';
                } else if (floors.length > 0) {
                    floorToSet = floors[0];
                }
                selectFloor(floorToSet, viewParams, viewToSelect, roomData);
            }

            function selectFloor(floor, viewParams = null, viewToSelect = null, roomData = null) {
                const shouldReload = selectedPolo !== lastLoadedPolo || selectedBuilding !== lastLoadedBuilding || floor !== lastLoadedFloor;
                selectedFloor = floor;

                selectView('top', shouldReload, viewParams, roomData);

                populateRooms(selectedBuilding, selectedFloor);

                // Aggiorna lo stile dei bottoni dei piani
                Array.from(floorsList.children).forEach(child => {
                    const floorValue = child.dataset.floor;
                    if (floorValue === floor) {
                        child.classList.add('selected');
                    } else {
                        child.classList.remove('selected');
                    }
                });

                if (floor !== "?")
                    updateURL(true); // Aggiorna l'URL ogni volta che si seleziona un piano
            }

            function selectView(viewType, forceReload = false, viewParams = null, roomData = null) {
                if (currentView === 'top' && !forceReload) return;

                currentView = 'top';

                if (selectedFloor !== "?")
                    loadSVG(selectedBuilding, selectedFloor, 'top', viewParams, roomData);
            }

            function setMapFlipState(shouldFlip, animate = true, delayVisuals = 0, persistState = true) {
                isMapFlipped = shouldFlip;

                // Save state for current building
                if (persistState && selectedPolo && selectedBuilding != null) {
                    const key = `${selectedPolo}-${selectedBuilding}`;
                    buildingFlipStates[key] = shouldFlip;
                }

                // if (viewer && viewer.viewport) {
                //     viewer.viewport.setRotation(shouldFlip ? 180 : 0);
                //     viewer.forceRedraw();
                // }

                if (flipViewBtn) {
                    flipViewBtn.classList.toggle('active', shouldFlip);
                    flipViewBtn.setAttribute('aria-pressed', shouldFlip ? 'true' : 'false');
                }

                const updateMap = () => {
                    const mapContainer = document.getElementById('map');
                    if (mapContainer) {
                        if (!animate) {
                            mapContainer.style.transition = 'none';
                        }

                        mapContainer.classList.toggle('map-flipped', shouldFlip);

                        if (!animate) {
                            // Force reflow
                            void mapContainer.offsetWidth;
                            // Restore transition on the next paint to avoid flash during building switch
                            requestAnimationFrame(() => {
                                requestAnimationFrame(() => {
                                    mapContainer.style.transition = '';
                                });
                            });
                        }
                    }
                    
                    // Update mini-map rotation in sidebar for current polo
                    updateMiniMapState();
                };

                if (delayVisuals > 0) {
                    setTimeout(updateMap, delayVisuals);
                } else {
                    updateMap();
                }
            }

            function updateFlipButtonVisibility(building) {
                if (!flipViewBtn) return;

                let shouldShow = false;
                if (building && selectedPolo && data.polo[selectedPolo] && data.polo[selectedPolo].edificio[building]) {
                    shouldShow = !!data.polo[selectedPolo].edificio[building].rotate;
                }

                flipViewBtn.classList.toggle('hidden', !shouldShow);
                flipViewBtn.disabled = !shouldShow;

                if (shouldShow) {
                    // Restore state
                    const key = `${selectedPolo}-${building}`;
                    const savedState = buildingFlipStates[key] || false;
                    // Only update if different, and disable animation for restoration on switch
                    if (isMapFlipped !== savedState) {
                        setMapFlipState(savedState, false, 300);
                    }
                    // Sync mini-map even if state didn't change (e.g. initial load)
                    updateMiniMapState();
                } else {
                    // If rotation not supported, ensure it is not flipped
                    if (isMapFlipped) {
                        setMapFlipState(false, false, 300, false);
                    }
                    // Also reset mini-map to normal orientation
                    updateMiniMapState();
                }
            }

            function getSVGPath(building, floor, suffix = '-top') {
                const root = getSiteRootPath();
                return building !== ''
                    ? `${root}polo/${selectedPolo}/edificio/${building}/piano/${floor}${suffix}.svg`
                    : `${root}polo/${selectedPolo}/edificio/${floor}${suffix}.svg`;
            }

            function checkForTopView(building, floor) {
                const topViewPath = getSVGPath(building, floor, '-top');
                const cacheKey = `${selectedPolo}/${building}/${floor}/top-exists`;

                // Controlla prima nella cache
                if (svgCache.has(cacheKey)) {
                    const exists = svgCache.get(cacheKey);
                    if (exists) {
                        viewControls.classList.remove('hidden');
                    } else {
                        viewControls.classList.add('hidden');
                    }
                    return;
                }

                // Se non in cache, fai la richiesta HEAD
                fetch(topViewPath, { method: 'HEAD' })
                    .then(response => {
                        const exists = response.ok;
                        svgCache.set(cacheKey, exists);
                        if (exists) {
                            viewControls.classList.remove('hidden');
                        } else {
                            viewControls.classList.add('hidden');
                        }
                    })
                    .catch(() => {
                        svgCache.set(cacheKey, false);
                        viewControls.classList.add('hidden');
                    });
            }

            // Funzione per gestire la cache LRU (Least Recently Used)
            function manageCacheSize(cacheKey) {
                // Aggiorna l'ordine di accesso
                const existingIndex = cacheAccessOrder.indexOf(cacheKey);
                if (existingIndex > -1) {
                    cacheAccessOrder.splice(existingIndex, 1);
                }
                cacheAccessOrder.push(cacheKey);

                // Rimuovi elementi più vecchi se la cache è piena
                while (cacheAccessOrder.length > MAX_CACHE_SIZE) {
                    const oldestKey = cacheAccessOrder.shift();
                    svgCache.delete(oldestKey);
                }
            }



            // Funzione per precaricare una SVG in background
            function preloadSVG(building, floor, viewType = 'top') {
                const cacheKey = `${selectedPolo}/${building}/${floor}/${viewType}`;

                // Se già in cache, non ricaricare
                if (svgCache.has(cacheKey)) {
                    return Promise.resolve(svgCache.get(cacheKey));
                }

                const svgPath = getSVGPath(building, floor, viewType === 'top' ? '-top' : '');

                return fetch(svgPath)
                    .then(response => {
                        if (!response.ok) {
                            throw new Error('Planimetria non trovata');
                        }
                        return response.text();
                    })
                    .then(svgData => {
                        // Parse e processa SVG
                        const parser = new DOMParser();
                        const svgDoc = parser.parseFromString(svgData, 'image/svg+xml');
                        const svgElement = svgDoc.documentElement;

                        // Strip embedded tooltips
                        svgElement.querySelectorAll('title, desc').forEach(node => node.remove());
                        svgElement.querySelectorAll('[title]').forEach(el => el.removeAttribute('title'));
                        svgElement.querySelectorAll('[data-tooltip]').forEach(el => el.removeAttribute('data-tooltip'));

                        // Ottieni viewBox o dimensioni SVG
                        const viewBox = svgElement.getAttribute('viewBox');
                        let width, height;

                        if (viewBox) {
                            const parts = viewBox.split(/\s+|,/);
                            width = parseFloat(parts[2]);
                            height = parseFloat(parts[3]);
                        } else {
                            width = parseFloat(svgElement.getAttribute('width')) || 1000;
                            height = parseFloat(svgElement.getAttribute('height')) || 1000;
                        }

                        // Serializza SVG modificato
                        const serializer = new XMLSerializer();
                        const modifiedSvgData = serializer.serializeToString(svgElement);
                        const svgDataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(modifiedSvgData)));

                        // Salva in cache
                        const cacheData = {
                            dataUrl: svgDataUrl,
                            bounds: [[0, 0], [height, width]],
                            width,
                            height
                        };

                        svgCache.set(cacheKey, cacheData);
                        manageCacheSize(cacheKey);

                        return cacheData;
                    })
                    .catch(error => {
                        console.warn(`Preload failed for ${svgPath}:`, error);
                        return null;
                    });
            }

            // Funzione per precaricare i piani adiacenti
            function preloadAdjacentFloors(building, currentFloor) {
                if (!data.polo || !data.polo[selectedPolo]) return;

                const edificio = data.polo[selectedPolo].edificio[building];
                if (!edificio || !edificio.piano) return;

                const floors = Object.keys(edificio.piano).map(f => parseInt(f)).sort((a, b) => a - b);
                const currentFloorInt = parseInt(currentFloor);
                const currentIndex = floors.indexOf(currentFloorInt);

                if (currentIndex === -1) return;

                // Precarica piano sopra
                if (currentIndex < floors.length - 1) {
                    const nextFloor = floors[currentIndex + 1].toString();
                    setTimeout(() => preloadSVG(building, nextFloor, currentView), 100);
                }

                // Precarica piano sotto
                if (currentIndex > 0) {
                    const prevFloor = floors[currentIndex - 1].toString();
                    setTimeout(() => preloadSVG(building, prevFloor, currentView), 200);
                }
            }

            // State tracking to prevent redundant marker updates
            let currentWaterDispenserContext = null;
            let currentStudyRoomContext = null;

            // Funzioni per gestire i marker degli erogatori d'acqua
            function showWaterDispensers() {
                if (!viewer || !data || !selectedPolo || selectedBuilding == null || !selectedFloor) return;

                const newContext = `${selectedPolo}-${selectedBuilding}-${selectedFloor}`;
                if (currentWaterDispenserContext === newContext && waterDispenserOverlays.length > 0) {
                    return;
                }

                // Rimuovi marker esistenti
                hideWaterDispensers();
                currentWaterDispenserContext = newContext;

                const tiledImage = viewer.world.getItemAt(0);
                if (!tiledImage) return;
                const contentSize = tiledImage.getContentSize();

                try {
                    const facilities = data.polo?.[selectedPolo]?.edificio?.[selectedBuilding]?.piano?.[selectedFloor];
                    if (!facilities || !Array.isArray(facilities)) return;

                    facilities.forEach(facility => {
                        if (facility.type === 'erogatore_acqua' && facility.coordinates) {
                            const { x, y } = facility.coordinates;
                            if (x != null && y != null) {
                                const osdY = contentSize.y - parseFloat(y);
                                const osdX = parseFloat(x);
                                const imagePoint = new OpenSeadragon.Point(osdX, osdY);
                                const viewportPoint = tiledImage.imageToViewportCoordinates(imagePoint);

                                const element = document.createElement('div');
                                element.className = 'water-dispenser-marker counter-rotate-marker';
                                element.innerHTML = `<span class="material-symbols-outlined">water_ec</span>`;
                                
                                element.setAttribute('data-marker-type', 'water-dispenser');
                                element.setAttribute('data-room-name', facility.nome || facility.ricerca || '');

                                viewer.addOverlay({
                                    element: element,
                                    location: viewportPoint,
                                    placement: 'CENTER'
                                });
                                waterDispenserOverlays.push(element);
                            }
                        }
                    });
                } catch (error) {
                    console.error('Errore nel mostrare gli erogatori d\'acqua:', error);
                }
            }

            function hideWaterDispensers() {
                currentWaterDispenserContext = null;
                if (!viewer) return;

                waterDispenserOverlays.forEach(element => {
                    viewer.removeOverlay(element);
                });
                waterDispenserOverlays = [];
            }

            function showStudyRoomMarkers() {
                if (!viewer || !data || !selectedPolo || selectedBuilding == null || !selectedFloor) return;

                const newContext = `${selectedPolo}-${selectedBuilding}-${selectedFloor}`;
                if (currentStudyRoomContext === newContext && studyRoomOverlays.length > 0) {
                    return;
                }

                // Rimuovi marker esistenti
                hideStudyRoomMarkers();
                currentStudyRoomContext = newContext;

                const tiledImage = viewer.world.getItemAt(0);
                if (!tiledImage) return;
                const contentSize = tiledImage.getContentSize();

                try {
                    const floorData = data.polo[selectedPolo].edificio[selectedBuilding]?.piano[selectedFloor];
                    const rooms = Array.isArray(floorData) ? floorData : (floorData?.aule ? Object.values(floorData.aule) : []);

                    rooms.forEach(room => {
                        if (roomHasType(room, 'studio') && room.coordinates) {
                            const { x, y } = room.coordinates;
                            if (x != null && y != null) {
                                const osdY = contentSize.y - parseFloat(y);
                                const osdX = parseFloat(x);
                                const imagePoint = new OpenSeadragon.Point(osdX, osdY);
                                const viewportPoint = tiledImage.imageToViewportCoordinates(imagePoint);

                                const element = document.createElement('div');
                                element.className = 'study-room-marker counter-rotate-marker';
                                element.innerHTML = `<span class="material-symbols-outlined">school</span>`;

                                // Make marker interactive and add data attributes for event delegation
                                element.style.pointerEvents = 'auto';
                                element.style.cursor = 'pointer';

                                // Create unique marker ID and store room data
                                const markerId = `study-room-${selectedPolo}-${selectedBuilding}-${selectedFloor}-${room.nome}`;
                                element.setAttribute('data-marker-type', 'study-room');
                                element.setAttribute('data-marker-id', markerId);
                                element.setAttribute('data-polo', selectedPolo);
                                element.setAttribute('data-building', selectedBuilding);
                                element.setAttribute('data-floor', selectedFloor);
                                element.setAttribute('data-room-name', room.nome);

                                // Store room data for retrieval in event handler
                                markerRoomDataMap.set(markerId, room);

                                viewer.addOverlay({
                                    element: element,
                                    location: viewportPoint,
                                    placement: 'CENTER'
                                });
                                studyRoomOverlays.push(element);
                            }
                        }
                    });
                } catch (error) {
                    console.error('Errore nel mostrare i marker delle aule studio:', error);
                }
            }

            function hideStudyRoomMarkers() {
                currentStudyRoomContext = null;
                if (!viewer) return;

                studyRoomOverlays.forEach(element => {
                    // Clean up marker data from Map
                    const markerId = element.getAttribute('data-marker-id');
                    if (markerId) {
                        markerRoomDataMap.delete(markerId);
                    }
                    viewer.removeOverlay(element);
                });
                studyRoomOverlays = [];
            }

            function loadSVG(building, floor, viewType = 'top', viewParams = null, roomData = null) {
                // Controlla se la vista top è disponibile
                checkForTopView(building, floor);

                // Aggiungi classe loading per l'animazione
                viewerContainer.classList.add('loading');

                const cacheKey = `${selectedPolo}/${building}/${floor}/${viewType}`;

                // Controlla prima se l'SVG è già in cache
                if (svgCache.has(cacheKey)) {
                    const cachedData = svgCache.get(cacheKey);
                    manageCacheSize(cacheKey); // Aggiorna ordine di accesso

                    // Usa i dati dalla cache
                    setTimeout(() => {
                        lastLoadedBuilding = building;
                        lastLoadedFloor = floor;
                        lastLoadedPolo = selectedPolo;
                        renderCachedSVG(cachedData, viewParams, roomData);
                        // Precarica piani adiacenti in background
                        preloadAdjacentFloors(building, floor);
                    }, 300);

                    return;
                }

                // Se non in cache, carica la SVG
                const svgPath = getSVGPath(building, floor, viewType === 'top' ? '-top' : '');

                fetch(svgPath)
                    .then(response => {
                        if (!response.ok) {
                            throw new Error('Planimetria non trovata');
                        }
                        return response.text();
                    })
                    .then(svgData => {
                        // Attendi che l'animazione di fade out sia completata
                        setTimeout(() => {
                            // Parse SVG per ottenere dimensioni
                            const parser = new DOMParser();
                            const svgDoc = parser.parseFromString(svgData, 'image/svg+xml');
                            const svgElement = svgDoc.documentElement;

                            // Strip embedded tooltips
                            svgElement.querySelectorAll('title, desc').forEach(node => node.remove());
                            svgElement.querySelectorAll('[title]').forEach(el => el.removeAttribute('title'));
                            svgElement.querySelectorAll('[data-tooltip]').forEach(el => el.removeAttribute('data-tooltip'));

                            // Ottieni viewBox o dimensioni SVG
                            const viewBox = svgElement.getAttribute('viewBox');
                            let width, height;

                            if (viewBox) {
                                const parts = viewBox.split(/\s+|,/);
                                width = parseFloat(parts[2]);
                                height = parseFloat(parts[3]);
                            } else {
                                width = parseFloat(svgElement.getAttribute('width')) || 1000;
                                height = parseFloat(svgElement.getAttribute('height')) || 1000;
                            }

                            // Serializza SVG modificato
                            const serializer = new XMLSerializer();
                            const modifiedSvgData = serializer.serializeToString(svgElement);
                            const svgDataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(modifiedSvgData)));

                            // Salva in cache
                            const cacheData = {
                                dataUrl: svgDataUrl,
                                bounds: [[0, 0], [height, width]],
                                width,
                                height
                            };

                            svgCache.set(cacheKey, cacheData);
                            manageCacheSize(cacheKey);

                            lastLoadedBuilding = building;
                            lastLoadedFloor = floor;
                            lastLoadedPolo = selectedPolo;

                            // Renderizza
                            renderCachedSVG(cacheData, viewParams, roomData);

                            // Precarica piani adiacenti in background
                            preloadAdjacentFloors(building, floor);
                        }, 300); // Tempo sincronizzato con la durata della transizione CSS
                    })
                    .catch(error => {
                        setTimeout(() => {
                            const mapContainer = document.getElementById('map');
                            mapContainer.innerHTML = `<p class="text-red-500 p-4">${error.message}</p>`;
                            viewerContainer.classList.remove('loading');
                        }, 300);
                    });
            }

            // Funzione helper per renderizzare SVG dalla cache
            function renderCachedSVG(cacheData, viewParams = null, roomData = null) {
                // Inizializza o re-inizializza la mappa
                if (!viewer) {
                    const isMobileDevice = typeof isRealMobileDevice === 'function' ? isRealMobileDevice() : false;

                    viewer = OpenSeadragon({
                        id: "map",
                        prefixUrl: "https://cdnjs.cloudflare.com/ajax/libs/openseadragon/4.1.0/images/",
                        // Parametri più reattivi per pan/zoom fluidi senza intaccare la rotazione
                        animationTime: isMobileDevice ? 1.1 : 0.9,
                        springStiffness: isMobileDevice ? 6.5 : 7.5,
                        // Zoom meno scattoso: passi più piccoli e resa immediata
                        blendTime: 0,
                        immediateRender: true,
                        imageLoaderLimit: 1,
                        // Rispetta meglio la velocità della rotellina/pinch aumentando la sensibilità per delta alti
                        pixelsPerWheelLine: 12,
                        showNavigationControl: false,
                        showNavigator: false,
                        defaultZoomLevel: 1,
                        minZoomLevel: 0.25,
                        maxZoomLevel: 20,
                        visibilityRatio: 0,
                        constrainDuringPan: false,
                        zoomPerScroll: 1.12,
                        zoomPerClick: 1.18,
                        // Disabilitiamo il canvas per mantenere le SVG nitide (nessuna rasterizzazione)
                        useCanvas: false,
                        smoothTileEdges: false,
                        gestureSettingsMouse: {
                            clickToZoom: false
                        },
                        gestureSettingsTouch: {
                            clickToZoom: false,
                            dblClickToZoom: false,
                            pinchToZoom: true,
                            flickEnabled: false
                        },
                    });

                    // Add handler for inverted controls when flipped
                    viewer.addHandler('canvas-drag', (e) => {
                        if (isMapFlipped) {
                            e.preventDefaultAction = true;
                            const viewportDelta = viewer.viewport.deltaPointsFromPixels(e.delta);
                            viewer.viewport.panBy(viewportDelta, true);
                        }
                    });

                    // Add handler for inverted scroll zoom when flipped
                    viewer.addHandler('canvas-scroll', (e) => {
                        if (isMapFlipped) {
                            e.preventDefaultAction = true;
                            const scroll = e.scroll;
                            const zoomFactor = Math.pow(viewer.zoomPerScroll, scroll);
                            // Invert the point coordinates relative to the container
                            const point = e.position;
                            const invertedPoint = new OpenSeadragon.Point(
                                viewer.container.clientWidth - point.x,
                                viewer.container.clientHeight - point.y
                            );
                            const viewportPoint = viewer.viewport.pointFromPixel(invertedPoint);
                            viewer.viewport.zoomBy(zoomFactor, viewportPoint);
                        }
                    });

                    // Add handler for inverted pinch zoom when flipped
                    viewer.addHandler('canvas-pinch', (e) => {
                        if (isMapFlipped) {
                            e.preventDefaultAction = true;
                            // Handle Zoom
                            const zoomFactor = e.distance / e.lastDistance;
                            const point = e.lastCenter;
                            const invertedPoint = new OpenSeadragon.Point(
                                viewer.container.clientWidth - point.x,
                                viewer.container.clientHeight - point.y
                            );
                            const viewportPoint = viewer.viewport.pointFromPixel(invertedPoint);
                            viewer.viewport.zoomBy(zoomFactor, viewportPoint, true);

                            // Handle Pan
                            const delta = e.center.minus(e.lastCenter);
                            const viewportDelta = viewer.viewport.deltaPointsFromPixels(delta);
                            viewer.viewport.panBy(viewportDelta, true);
                        }
                    });

                    // Add handler for tile-loaded to set alt attribute
                    viewer.addHandler('tile-loaded', (event) => {
                        const altText = `Polo ${selectedPolo.charAt(0).toUpperCase() + selectedPolo.slice(1)}, Edificio ${selectedBuilding.toUpperCase()}, Piano ${selectedFloor}`;
                        if (event.data) {
                            event.data.alt = altText;
                        }
                    });

                    // Event delegation: single click handler for all map markers
                    const mapContainer = document.getElementById('map');
                    if (mapContainer && !mapContainer.hasAttribute('data-marker-delegation-installed')) {
                        mapContainer.setAttribute('data-marker-delegation-installed', 'true');
                        mapContainer.addEventListener('click', (e) => {
                            // Find the closest marker element
                            const marker = e.target.closest('[data-marker-type]');
                            if (!marker) return;

                            const markerType = marker.getAttribute('data-marker-type');

                            if (markerType === 'study-room') {
                                e.stopPropagation();

                                // Retrieve room data from Map
                                const markerId = marker.getAttribute('data-marker-id');
                                const room = markerRoomDataMap.get(markerId);

                                if (room) {
                                    const polo = marker.getAttribute('data-polo');
                                    const building = marker.getAttribute('data-building');
                                    const floor = marker.getAttribute('data-floor');
                                    const roomName = marker.getAttribute('data-room-name');

                                    selectRoom(polo, building, floor, room);
                                    expandRoomDetailsInSidebar(roomName);
                                    triggerSidebarButtonAnimation();
                                }
                            } else if (markerType === 'person') {
                                e.stopPropagation();

                                // Retrieve room data from Map
                                const markerId = marker.getAttribute('data-marker-id');
                                const room = markerRoomDataMap.get(markerId);

                                if (room) {
                                    const polo = marker.getAttribute('data-polo');
                                    const building = marker.getAttribute('data-building');
                                    const floor = marker.getAttribute('data-floor');
                                    const roomName = marker.getAttribute('data-room-name');

                                    selectRoom(polo, building, floor, room);
                                    expandRoomDetailsInSidebar(roomName);
                                    triggerSidebarButtonAnimation();
                                }
                            }
                            // Future marker types can be added here (e.g., water-dispenser)
                        });
                    }

                    registerViewerInteractionGuards();
                }

                // Reimposta lo stato dei marker prima di ricaricare
                // Questo è fondamentale quando si ricarica lo stesso piano:
                // viewer.open() pulisce i visual, ma noi dobbiamo pulire anche lo stato logico
                // (currentWaterDispenserContext, etc) altrimenti le funzioni show* penseranno
                // che i marker siano già lì e non faranno nulla.
                hideWaterDispensers();
                hideStudyRoomMarkers();
                currentSelectedRoomOverlay = null;

                // Open the image
                viewer.open({
                    type: 'image',
                    url: cacheData.dataUrl,
                    buildPyramid: false
                });

                // Wait for open event to set view
                viewer.addOnceHandler('open', () => {
                    const tiledImage = viewer.world.getItemAt(0);

                    if (!tiledImage) return;
                    const contentSize = tiledImage.getContentSize();

                    // Imposta la vista iniziale
                    if (roomData && roomData.coordinates && roomData.coordinates.x != null && roomData.coordinates.y != null) {
                        const osdY = contentSize.y - parseFloat(roomData.coordinates.y);
                        const osdX = parseFloat(roomData.coordinates.x);
                        const imagePoint = new OpenSeadragon.Point(osdX, osdY);
                        const viewportPoint = tiledImage.imageToViewportCoordinates(imagePoint);

                        const zoom = roomData.coordinates.zoom != null ? parseFloat(roomData.coordinates.zoom) : 2;
                        // Use Image Zoom
                        const viewportZoom = tiledImage.imageToViewportZoom(zoom);

                        markProgrammaticMapChange();

                        // Use requestAnimationFrame to ensure the map is fully rendered before starting animation
                        // This prevents the "first frame lag" when switching buildings
                        requestAnimationFrame(() => {
                            viewer.viewport.panTo(viewportPoint);
                            viewer.viewport.zoomTo(viewportZoom);
                            
                            addSelectedRoomMarker(roomData, viewportPoint);
                        });
                    } else if (viewParams && viewParams.x && viewParams.y && viewParams.z) {
                        // Usa i parametri salvati dall'URL (Leaflet coords)
                        const osdY = contentSize.y - parseFloat(viewParams.y);
                        const osdX = parseFloat(viewParams.x);
                        const imagePoint = new OpenSeadragon.Point(osdX, osdY);
                        const viewportPoint = tiledImage.imageToViewportCoordinates(imagePoint);

                        const zoom = parseFloat(viewParams.z);
                        // Use Image Zoom
                        const viewportZoom = tiledImage.imageToViewportZoom(zoom);

                        markProgrammaticMapChange();
                        requestAnimationFrame(() => {
                            viewer.viewport.panTo(viewportPoint);
                            viewer.viewport.zoomTo(viewportZoom);
                        });
                    } else {
                        // Adatta alla vista
                        markProgrammaticMapChange();
                        viewer.viewport.goHome(true);
                    }

                    // Apply rotation if needed
                    // viewer.viewport.setRotation(isMapFlipped ? 180 : 0);

                    const mapContainer = document.getElementById('map');
                    if (mapContainer) {
                        mapContainer.classList.toggle('map-flipped', isMapFlipped);
                    }

                    // Rimuovi la classe loading per il fade in
                    setTimeout(() => {
                        viewerContainer.classList.remove('loading');
                    }, 50);

                    // Mostra gli erogatori d'acqua solo se il setting è attivo E la vista è "top"
                    if (settingsConfig.showWaterDispensers) {
                        showWaterDispensers();
                    }

                    // Mostra le aule studio solo se il setting è attivo E la vista è "top"
                    if (settingsConfig.showStudyRooms) {
                        showStudyRoomMarkers();
                    }

                    // Aggiorna l'URL con le coordinate corrette dopo il caricamento
                    // per evitare coordinate obsolete dopo un refresh
                    requestAnimationFrame(() => {
                        updateURL(true);
                    });
                });
            }

            // Rimuovi la classe no-transition per abilitare le animazioni dopo il caricamento iniziale
            // ma fallo in un timeout per evitare animazioni indesiderate al caricamento
            setTimeout(() => {
                document.body.classList.remove('no-transition');
            }, 50);

            // Reapply translations when page becomes visible again (useful on mobile when switching apps)
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden && translationsLoaded) {
                    applyTranslations();
                }
            });

            // Reapply translations on page focus (additional safety for mobile)
            window.addEventListener('focus', () => {
                if (translationsLoaded) {
                    applyTranslations();
                }
            });

            // Occupazione corrente delle aule
            window.classroomAvailability = window.classroomAvailability || {};

            // Cache per le richieste API in corso per evitare duplicati
            const pendingApiRequests = new Map();

            // ============================================
            // CINECA API INTEGRATION (Variables moved to top of script)
            // ============================================
            
            // DEBUG: Imposta una data specifica per testare (es. '2026-02-02T10:00:00')
            // Imposta a null per usare la data/ora corrente reale
            const DEBUG_TIME = null;

            function getNow() {
                return DEBUG_TIME ? new Date(DEBUG_TIME) : new Date();
            }

            async function fetchCinecaEventsForCalendar(calendarId) {
                if (!calendarId) return [];
                const now = getNow();
                const todayStr = now.toISOString().split('T')[0];

                // 1. Check per-calendar cache (5 minutes validity)
                const cached = cinecaCacheMap.get(calendarId);
                if (cached && cached.date === todayStr && (Date.now() - cached.timestamp < 300000)) {
                    return cached.data;
                }

                // 2. Return valid in-flight promise to avoid duplicate requests
                if (cinecaFetchPromiseMap.has(calendarId)) {
                    return cinecaFetchPromiseMap.get(calendarId);
                }

                // 3. Start new fetch
                const fetchPromise = (async () => {
                    const start = getNow();
                    start.setHours(0, 0, 0, 0);
                    const end = getNow();
                    end.setHours(23, 59, 59, 999);

                    const payload = {
                        'mostraImpegniAnnullati': true,
                        'mostraIndisponibilitaTotali': false,
                        'linkCalendarioId': calendarId,
                        'clienteId': CINECA_CLIENT_ID,
                        'pianificazioneTemplate': false,
                        'dataInizio': start.toISOString(),
                        'dataFine': end.toISOString()
                    };

                    try {
                        const response = await fetch('https://apache.prod.up.cineca.it/api/Impegni/getImpegniCalendarioPubblico', {
                            method: 'POST',
                            body: JSON.stringify(payload),
                            headers: { 
                                'Content-Type': 'application/json;charset=UTF-8'
                            }
                        });

                        if (!response.ok) throw new Error(`Status ${response.status}`);
                        
                        const events = await response.json();
                        
                        // Success! Update per-calendar cache
                        cinecaCacheMap.set(calendarId, { data: events, timestamp: Date.now(), date: todayStr });
                        return events;
                    } catch (e) {
                        console.error('Cineca API fetch failed for calendar', calendarId, ':', e);
                        return [];
                    }
                })().catch(err => {
                    console.error("Cineca Fetch Error:", err);
                    return [];
                }).finally(() => {
                    cinecaFetchPromiseMap.delete(calendarId);
                });

                cinecaFetchPromiseMap.set(calendarId, fetchPromise);
                return fetchPromise;
            }

            /**
             * Get all calendar entries for a polo.
             * Returns an array of { calendarId, prefix, buildingKey } objects.
             * - Fibonacci: has a single calendar_id at polo level
             * - Ingegneria: each building has its own calendar_id
             */
            function getCalendarIdsForPolo(poloName) {
                const poloData = data?.polo?.[poloName];
                if (!poloData) return [];

                const result = [];

                // 1. Check polo-level calendar_id (e.g., Fibonacci)
                if (poloData.calendar_id) {
                    result.push({
                        calendarId: poloData.calendar_id,
                        prefix: poloData.prefix || '',
                        buildingKey: null
                    });
                }

                // 2. Check per-building calendar_ids (e.g., Ingegneria buildings)
                if (poloData.edificio) {
                    Object.entries(poloData.edificio).forEach(([buildingKey, buildingData]) => {
                        if (buildingData.calendar_id) {
                            result.push({
                                calendarId: buildingData.calendar_id,
                                prefix: buildingData.prefix || '',
                                buildingKey: buildingKey
                            });
                        }
                    });
                }

                return result;
            }

            /**
             * Fetch all events for a polo by fetching from all its calendars.
             * Returns a flat array of all events across all calendars.
             */
            async function fetchAllEventsForPolo(poloName) {
                const calendarEntries = getCalendarIdsForPolo(poloName);
                if (calendarEntries.length === 0) return [];

                const allEvents = await Promise.all(
                    calendarEntries.map(entry => fetchCinecaEventsForCalendar(entry.calendarId))
                );

                return allEvents.flat();
            }

            function prettyAulaName(name) {
                if (!name) return name;
                let result = name.replace('RIUNIONI', 'Riunioni');
                result = result.replace(/([A-Z0-9])\-LAB/, 'Lab $1');
                return result;
            }

            function prettyProfName(name, surname) {
                const s = (surname || '').toLowerCase().trim().replace(/(?:^|\s)\S/g, c => c.toUpperCase());
                const n = (name || '').toLowerCase().trim().replace(/(?:^|\s)\S/g, c => c.toUpperCase());
                return n ? `${s} ${n}` : s;
            }

            function getEventStatusString(event) {
                // "08:30 - 10:30|Course|Degree|Teacher"
                const start = new Date(event.dataInizio);
                const end = new Date(event.dataFine);
                
                const formatTime = (d) => {
                    return d.toLocaleTimeString('it-IT', { 
                        hour: '2-digit', 
                        minute: '2-digit',
                        timeZone: 'Europe/Rome'
                    });
                };

                const timeRange = `${formatTime(start)} - ${formatTime(end)}`;
                
                let name = event.nome || '';
                // "ANALISI MATEMATICA - (MAT-L) - AULA 3" -> "ANALISI MATEMATICA"
                const parts = name.split('-');
                const cleanName = parts[0].trim();
                
                const docenti = (event.docenti || []).map(d => prettyProfName(d.nome, d.cognome)).join(', ');
                
                return `${timeRange}|${cleanName}| |${docenti}`;
            }

            /**
             * GET /api/poles_data -> Mocked
             */
            async function getPolesData() {
                return { "poles_data": [{ "Fibonacci": "internal" }] };
            }

            /**
             * GET /api/get_all_rooms_given_pole -> Mocked
             */
            async function getAllRoomsGivenPole(poleName) {
                return { "pole": poleName, "all_rooms": [] };
            }

            /**
             * GET /api/all_schedules_given_pole_and_room
             */
            async function getAllSchedulesGivenPoleAndRoom(poleName, classroom) {
                const events = await fetchAllEventsForPolo(poleName.toLowerCase());
                const roomEvents = [];

                events.forEach(event => {
                    const hasRoom = (event.aule || []).some(a => prettyAulaName(a.codice) === classroom);
                    if (hasRoom) {
                        roomEvents.push(getEventStatusString(event));
                    }
                });
                
                roomEvents.sort();
                return { [classroom]: roomEvents };
            }

            /**
             * GET /api/free_classrooms_now_given_pole
             */
            async function getFreeClassroomsNowGivenPole(poleName) {
                 return { free_classrooms: [] }; // Implementation complex, leaving empty
            }

            /**
             * GET /api/current_schedule_given_pole_and_room
             */
            async function getCurrentScheduleGivenPoleAndRoom(poleName, classroom) {
                const payload = await getSchedulesPayloadGivenPole(poleName);
                const val = payload.schedules && payload.schedules[classroom];
                return { [classroom]: val || "" };
            }

            /**
             * GET /api/schedules_payload_given_pole
             */
            async function getSchedulesPayloadGivenPole(poleName, classrooms = null) {
                const poloKey = poleName.toLowerCase();
                const events = await fetchAllEventsForPolo(poloKey);
                const now = getNow();
                const schedules = {};

                events.forEach(event => {
                    const start = new Date(event.dataInizio);
                    const end = new Date(event.dataFine);
                    
                    // Check strict overlap (NOW is between start and end)
                    if (now >= start && now < end) {
                        const statusStr = getEventStatusString(event);
                        
                        (event.aule || []).forEach(aula => {
                            const key = prettyAulaName(aula.codice);
                            // Last write wins for overlap
                            schedules[key] = statusStr;
                        });
                    }
                });

                return { pole: poleName, schedules: schedules };
            }

            // ============================================
            // CLASSROOM AVAILABILITY FUNCTIONS
            // ============================================

            function populateClassroomAvailability() {
                if (!data?.polo) {
                    // Dati stanze non ancora caricati, riprovo...
                    setTimeout(populateClassroomAvailability, 100);
                    return;
                }

                if (pendingApiRequests.has('batch_population')) {
                    return; // Avoid concurrent batch updates
                }

                // Identify polos to fetch data for (optimize for selectedPolo or fetch all)
                const polosToFetch = selectedPolo ? [selectedPolo] : Object.keys(data.polo);

                pendingApiRequests.set('batch_population', true);

                Promise.all(polosToFetch.map(async (poloName) => {
                    // Capitalize for API: "fibonacci" -> "Fibonacci"
                    const displayPoloName = poloName.charAt(0).toUpperCase() + poloName.slice(1);

                    try {
                        const payload = await getSchedulesPayloadGivenPole(displayPoloName);
                        if (!payload || !payload.schedules) return;

                        // Map local room names to availability using per-building prefix
                        const poloData = data.polo[poloName];
                        if (!poloData) return;

                        Object.values(poloData.edificio || {}).forEach(building => {
                            // Use building prefix, fall back to polo prefix
                            const prefix = building.prefix || poloData.prefix || '';

                            Object.values(building.piano || {}).forEach(floorData => {
                                const rooms = Array.isArray(floorData) ? floorData : (floorData?.aule ? Object.values(floorData.aule) : []);

                                rooms.forEach(room => {
                                    // Only care about rooms that have status
                                    if (room.hasStatus === false) return;
                                    if (!room.nome) return;
                                    if (room.type && !['aula', 'studio', 'sala', 'laboratorio'].includes(room.type)) return;

                                    // Generate key expected in API response
                                    // e.g. "Aula A" -> "FIB A", "Aula B32" -> "ING B32", "Aula F5" -> "ETR F5", "Aula 6" -> "PN 6"
                                    // If room has explicit cineca key, use that instead
                                    const apiKey = room.cineca || room.nome.replace(/^Aula\s+/i, prefix + ' ');

                                    // Direct lookup in payload
                                    const scheduleValue = payload.schedules[apiKey];

                                    // Use polo-scoped key to avoid collisions between polos
                                    const availabilityKey = `${poloName}:${room.nome}`;

                                    // Update global state
                                    if (scheduleValue === undefined) {
                                        // Not found in API -> Unavailable
                                        window.classroomAvailability[availabilityKey] = {
                                            code: 2,
                                            startTime: '', endTime: '', occupiedBy: ''
                                        };
                                    } else if (scheduleValue === "" || scheduleValue === null) {
                                        // Free
                                        window.classroomAvailability[availabilityKey] = {
                                            code: 0,
                                            startTime: '', endTime: '', occupiedBy: ''
                                        };
                                    } else {
                                        // Occupied
                                        const parts = scheduleValue.split("|");
                                        const timeRange = parts[0] || '';
                                        const [start, end] = timeRange.split(' - ');

                                        window.classroomAvailability[availabilityKey] = {
                                            code: 1,
                                            startTime: start || '',
                                            endTime: end || '',
                                            occupiedBy: parts.slice(1).join('|') || ''
                                        };
                                    }
                                });
                            });
                        });

                    } catch (err) {
                        console.warn("Batch availability fetch failed for", poloName, err);
                    }
                })).finally(() => {
                    pendingApiRequests.delete('batch_population');
                    // Trigger UI refresh 
                    refreshSearchResultsOccupancy();
                });
            }

            async function getClassroomAvailability(classroom) {
                const unavailableLabel = t('availability_unavailable');
                const freeLabel = t('availability_free');

                // If setting is disabled, return unavailable immediately
                if (!settingsConfig.showClassroomStatus) {
                    return { 2: unavailableLabel };
                }

                // classroom is now polo-scoped: "polo:Aula X"
                if (window.classroomAvailability[classroom]) {
                    const cached = window.classroomAvailability[classroom];
                    if (cached.code === 0) {
                        return { 0: freeLabel };
                    } else if (cached.code === 1) {
                        const value = `${cached.startTime}|${cached.endTime}|${cached.occupiedBy}`;
                        return { 1: value };
                    } else {
                        return { 2: unavailableLabel };
                    }
                }

                // Se c'è già una richiesta in corso per questa aula, restituisci quella promessa
                if (pendingApiRequests.has(classroom)) {
                    return pendingApiRequests.get(classroom);
                }

                // Parse polo and room name from the scoped key
                const colonIdx = classroom.indexOf(':');
                const poloName = colonIdx >= 0 ? classroom.substring(0, colonIdx) : (selectedPolo || 'fibonacci');
                const roomName = colonIdx >= 0 ? classroom.substring(colonIdx + 1) : classroom;

                const poloData = data?.polo?.[poloName];
                let prefix = poloData?.prefix || 'FIB';

                // For polos with per-building calendars, find the correct building prefix
                if (poloData?.edificio) {
                    for (const building of Object.values(poloData.edificio)) {
                        if (building.prefix) {
                            const buildingHasRoom = Object.values(building.piano || {}).some(floorData => {
                                const rooms = Array.isArray(floorData) ? floorData : [];
                                return rooms.some(r => r.nome === roomName);
                            });
                            if (buildingHasRoom) {
                                prefix = building.prefix;
                                break;
                            }
                        }
                    }
                }

                // Check if the room has an explicit cineca key override
                let cinecaKey = null;
                if (poloData?.edificio) {
                    outer: for (const building of Object.values(poloData.edificio)) {
                        for (const floorData of Object.values(building.piano || {})) {
                            const rooms = Array.isArray(floorData) ? floorData : [];
                            const found = rooms.find(r => r.nome === roomName);
                            if (found?.cineca) { cinecaKey = found.cineca; break outer; }
                        }
                    }
                }
                const classroomApiName = cinecaKey || roomName.replace(/^Aula\s+/i, prefix + ' ');
                const displayPoloName = poloName.charAt(0).toUpperCase() + poloName.slice(1);

                // Crea la promessa e salvala nella cache delle richieste pendenti
                const promise = getCurrentScheduleGivenPoleAndRoom(displayPoloName, classroomApiName)
                    .then(data => {
                        if (!data || typeof data !== 'object') {
                            return { 2: unavailableLabel };
                        }

                        const classroomKey = Object.keys(data)[0];
                        if (!classroomKey) {
                            return { 2: unavailableLabel };
                        }

                        const scheduleValue = data[classroomKey];

                        if (scheduleValue === "" || scheduleValue === null) {
                            return { 0: freeLabel };
                        }

                        return { 1: scheduleValue };
                    })
                    .catch(error => {
                        console.error('Error fetching classroom availability:', error);
                        return { 2: unavailableLabel };
                    })
                    .finally(() => {
                        pendingApiRequests.delete(classroom);
                    });

                pendingApiRequests.set(classroom, promise);

                return promise;
            }

            // ============================================
            // OCCUPANCY REFRESH LOGIC
            // ============================================


            let occupancyRefreshIntervalId = null;

            function hasVisibleOccupancyBars() {
                const desktopVisible = searchResults && !searchResults.classList.contains('hidden');
                const mobileVisible = searchResultsMobile && !searchResultsMobile.classList.contains('hidden');

                if (!desktopVisible && !mobileVisible) {
                    return false;
                }

                if (desktopVisible && searchResults.querySelector('.occupancy-status-bar')) {
                    return true;
                }

                if (mobileVisible && searchResultsMobile.querySelector('.occupancy-status-bar')) {
                    return true;
                }

                return false;
            }

            function startOccupancyRefreshLoop() {
                if (occupancyRefreshIntervalId || !hasVisibleOccupancyBars()) {
                    return;
                }
                refreshSearchResultsOccupancy();
                occupancyRefreshIntervalId = setInterval(() => {
                    if (!hasVisibleOccupancyBars()) {
                        stopOccupancyRefreshLoop();
                        return;
                    }
                    refreshSearchResultsOccupancy();
                }, 60000);
            }

            function stopOccupancyRefreshLoop() {
                if (occupancyRefreshIntervalId) {
                    clearInterval(occupancyRefreshIntervalId);
                    occupancyRefreshIntervalId = null;
                }
            }

            function manageOccupancyRefreshLoop() {
                if (hasVisibleOccupancyBars()) {
                    startOccupancyRefreshLoop();
                } else {
                    stopOccupancyRefreshLoop();
                }
            }

            // Aggiorna l'occupazione mostrata nei risultati di una ricerca se diventano disponibili
            function refreshSearchResultsOccupancy() {
                if (!hasVisibleOccupancyBars()) {
                    return;
                }
                document.querySelectorAll(".occupancy-status-bar").forEach(statusBar => {
                    const classroomName = statusBar.getAttribute('data-classroom');

                    // If setting is disabled, ensure no bars are shown
                    if (!settingsConfig.showClassroomStatus) {
                        statusBar.remove();
                        return;
                    }

                    const availabilityData = classroomName && window.classroomAvailability[classroomName];

                    if (availabilityData && statusBar.classList.contains('loading')) {
                        // Remove loading state
                        statusBar.classList.remove('loading');

                        // Update based on actual data
                        if (availabilityData.code === 0) {
                            // Libera
                            statusBar.classList.add('free');
                            const textSpan = statusBar.querySelector('.occupancy-text');
                            if (textSpan) textSpan.textContent = t('availability_free');
                        } else if (availabilityData.code === 1) {
                            // Occupata
                            statusBar.classList.add('occupied');
                            const textSpan = statusBar.querySelector('.occupancy-text');
                            if (textSpan) textSpan.textContent = t('availability_occupied');

                            // Add expand icon if time range exists and not already present
                            if (availabilityData.startTime && availabilityData.endTime && !statusBar.querySelector('.occupancy-expand-icon')) {
                                const occupancyId = `occupancy-${classroomName.replace(/[\s:]/g, '-')}`;
                                const timeRange = `${availabilityData.startTime} - ${availabilityData.endTime}`;

                                const expandIcon = document.createElement('span');
                                expandIcon.className = 'occupancy-expand-icon material-symbols-outlined';
                                expandIcon.setAttribute('data-occupancy-id', occupancyId);
                                expandIcon.textContent = 'expand_more';
                                statusBar.appendChild(expandIcon);

                                // Make the entire bar clickable
                                statusBar.style.cursor = 'pointer';
                                statusBar.addEventListener('click', (e) => {
                                    e.stopPropagation();
                                    const detailsElement = document.getElementById(occupancyId);
                                    if (detailsElement) {
                                        detailsElement.classList.toggle('expanded');
                                        expandIcon.classList.toggle('expanded');
                                    }
                                });

                                // Add details section if not exists
                                if (!document.getElementById(occupancyId)) {
                                    const detailsDiv = document.createElement('div');
                                    detailsDiv.className = 'occupancy-details';
                                    detailsDiv.id = occupancyId;
                                    detailsDiv.innerHTML = `
                                        <div class="occupancy-details-content">
                                            ${timeRange}
                                        </div>
                                    `;
                                    statusBar.parentNode.insertBefore(detailsDiv, statusBar.nextSibling);
                                }
                            }
                        } else if (availabilityData.code === 2) {
                            // Dati non disponibili - rimuovi completamente la barra
                            const parentElement = statusBar.parentNode;
                            if (parentElement) {
                                statusBar.remove();
                            }
                        }
                    }
                });
            }
            // L'aggiornamento ora parte solo quando i risultati con l'indicatore di occupazione sono visibili
            // Fine occupazione corrente aule

        } // End of initApp function
