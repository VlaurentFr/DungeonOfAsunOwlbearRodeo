import { ref, computed, toRaw } from 'vue';
import OBR from '@owlbear-rodeo/sdk';
import {
	type CharacterSheet,
	type StatName,
	type WeaponType,
	type DiceRollLog,
	type WeaponItem,
	type SpellItem,
	getRankFromXp,
	SPECIES_DATA,
} from '../types/character';
import { useCharacters } from './useCharacters';
import { useAuth } from './useAuth';
import { useCampaign } from './useCampaign';
import { supabase } from '../lib/supabase';

const BROADCAST_CHAT_CHANNEL = 'com.homebrew.sheet/chat_messages';
const PLAYER_SHEET_KEY = 'com.homebrew.sheet/character';

type CharacterSheetWithLegacyId = CharacterSheet & {
	legacyId?: string;
	supabaseId?: string;
	supabaseOwnerIds?: string[];
};

// Définis le type d'un message de chat
export interface ChatMessage extends DiceRollLog {
	id: string;
	senderId: string;
	senderName: string;
	senderColor: string;
	text: string;
	timestamp: string;
	isWhisper?: boolean;
	isRoll?: boolean;
	infos?: string;
}

const DEFAULT_WEAPON_XP: Record<WeaponType, number> = {
	Epee: 0,
	Dague: 0,
	Arc: 0,
	Masse: 0,
	Lance: 0,
	Magie: 0,
	Hache: 0,
	Poing: 0,
};

export function useOwlbear() {
	const isReady = ref(false);
	const currentUserId = ref<string>('');
	const currentUserName = ref<string>('Joueur');
	const currentUserColor = ref<string>('#3b82f6');
	const userRole = ref<'GM' | 'PLAYER'>('PLAYER');
	// Liste réactive globale pour stocker tous les joueurs connus de la partie
	const knownPlayers = ref<{ id: string; name: string; color: string }[]>([]);

	const {
		listCharacters,
		loadCharacter,
		saveCharacter: saveSupabaseCharacter,
		deleteCharacter: deleteSupabaseCharacter,
	} = useCharacters();

	const { user } = useAuth();

	const { campaign } = useCampaign();

	async function initRoomPlayersObserver() {
		// 1. Récupérer les joueurs actuellement connectés
		const players = await OBR.party.getPlayers();

		// 2. Mettre à jour les métadonnées de la Room avec ces joueurs
		const roomMetadata = await OBR.room.getMetadata();

		let savedPlayers = (roomMetadata['room_known_players'] as { id: string; name: string; color: string }[]) || [];

		// On fusionne pour ajouter les nouveaux joueurs qu'on ne connaît pas encore
		let updated = false;
		for (const p of players) {
			if (!savedPlayers.some((sp) => sp.id === p.id)) {
				savedPlayers.push({ id: p.id, name: p.name, color: p.color });
				updated = true;
			}
		}

		if (updated) {
			await OBR.room.setMetadata({ room_known_players: savedPlayers });
		}

		knownPlayers.value = savedPlayers;

		// 3. Écouter les changements en temps réel (si un joueur se connecte en cours de partie)
		OBR.party.onChange(async (currentPlayers) => {
			const currentMeta = await OBR.room.getMetadata();
			let currentSaved = (currentMeta['room_known_players'] as { id: string; name: string; color: string }[]) || [];
			let changeDetected = false;

			for (const p of currentPlayers) {
				if (!currentSaved.some((sp) => sp.id === p.id)) {
					currentSaved.push({ id: p.id, name: p.name, color: p.color });
					changeDetected = true;
				}
			}

			if (changeDetected) {
				await OBR.room.setMetadata({ room_known_players: currentSaved });
				knownPlayers.value = currentSaved;
			}
		});
	}

	const chatMessages = ref<ChatMessage[]>([]);

	const sheet = ref<CharacterSheet>({
		id: '',
		type: 'monster',
		name: 'Aucun',
		species: 'Aucune',
		ownerIds: [],
		stats: { force: 10, dexterite: 10, intellect: 10, sagesse: 10 },
		weaponXp: { ...DEFAULT_WEAPON_XP },
		hpCurrent: 30,
		hpMax: 30,
		peCurrent: 40,
		peMax: 40,
		wounds: [false, false, false, false, false, false],
		corruption: 0,
		ec: 0,
		spells: [],
		weapons: [],
		armors: [],
		feats: [],
		inventory: [],
		subTabOrder: [],
	});

	const isGM = computed(() => userRole.value === 'GM');
	const canEdit = computed(() => {
		if (isGM.value) return true;

		if (sheet.value.type !== 'pj') return false;

		const character = partySheets.value.find((entry) => entry.id === sheet.value.id);

		return character?.supabaseOwnerIds?.includes(user.value?.id ?? '') ?? false;
	});

	const availableTokens = computed(() => {
		if (isGM.value) return partySheets.value;

		const supabaseUserId = user.value?.id;

		if (!supabaseUserId) return [];

		return partySheets.value.filter((char) => char.type === 'pj' && char.supabaseOwnerIds?.includes(supabaseUserId));
	});

	const currentSpeciesData = computed(() => SPECIES_DATA[sheet.value.species] || SPECIES_DATA['Aucune']);

	const maxBonusRank = computed(() => {
		let maxBonus = 0;
		for (const weapon in sheet.value.weaponXp) {
			const xp = sheet.value.weaponXp[weapon as WeaponType] || 0;
			const rankData = getRankFromXp(xp);
			if (rankData.bonusCount > maxBonus) maxBonus = rankData.bonusCount;
		}
		return maxBonus;
	});

	const estimatedHpMax = computed(() => {
		const baseStats = sheet.value.stats.force + sheet.value.stats.dexterite;
		return baseStats + 10 + 20 * maxBonusRank.value;
	});

	const estimatedPeMax = computed(() => {
		return (sheet.value.stats.intellect + sheet.value.stats.sagesse) * 2;
	});

	const dodgePenalty = computed(() => {
		const dex = sheet.value.stats.dexterite;
		if (dex >= 12) return -4;
		if (dex >= 10) return -3;
		if (dex >= 8) return -2;
		if (dex >= 6) return -1;
		return 0;
	});
	const protectionPenalty = computed(() => {
		const dexterity = sheet.value.armors
			.filter((a) => a.protection > 0 && a.equipped)
			.reduce((sum, a) => sum + a.dexMalus, 0);
		const protection = sheet.value.armors
			.filter((a) => a.protection > 0 && a.equipped)
			.reduce((sum, a) => sum + a.protection, 0);
		return { protection, dexterity };
	});
	const dodgePenaltyChar = (char: CharacterSheet) => {
		const dex = char.stats.dexterite;
		if (dex >= 12) return -4;
		if (dex >= 10) return -3;
		if (dex >= 8) return -2;
		if (dex >= 6) return -1;
		return 0;
	};
	const protectionPenaltyChar = (char: CharacterSheet) => {
		const dexterity = char.armors.filter((a) => a.protection > 0 && a.equipped).reduce((sum, a) => sum + a.dexMalus, 0);
		const protection = char.armors
			.filter((a) => a.protection > 0 && a.equipped)
			.reduce((sum, a) => sum + a.protection, 0);
		return { protection, dexterity };
	};

	const corruptionStatus = computed(() => {
		const c = sheet.value.corruption;
		if (c >= 20) return { level: 'Perdu', class: 'status-perdu', effect: 'Devient PNJ' };
		if (c >= 16) return { level: 'Sombre', class: 'status-sombre', effect: '+2 Magie, -3 Charisme | Repos ≠ Soin' };
		if (c >= 6) return { level: 'Entaché', class: 'status-entache', effect: '+1 Magie, -1 Charisme' };
		return { level: 'Pur', class: 'status-pur', effect: 'Aucun effet' };
	});

	// ID du token actuellement sélectionné dans la liste déroulante de l'extension
	const currentSheetTokenId = ref<string | null>(null);

	async function changeActiveToken(tokenId: string | null) {
		currentSheetTokenId.value = tokenId;
		await loadSelection();
		// Optionnel : si tu veux aussi synchroniser avec la sélection sur la carte d'Owlbear Rodeo
		// await OBR.scene.items.select([tokenId]);
	}

	let scrollChat = () => {};

	async function init(scrollToBottom: () => Promise<void>) {
		scrollChat = scrollToBottom;

		OBR.onReady(async () => {
			currentUserId.value = await OBR.player.getId();
			currentUserName.value = await OBR.player.getName();
			currentUserColor.value = await OBR.player.getColor();
			userRole.value = await OBR.player.getRole();

			OBR.broadcast.onMessage(BROADCAST_CHAT_CHANNEL, async (event) => {
				const msg = event.data as ChatMessage;
				if (msg.isWhisper) {
					if (isGM.value || msg.senderId === currentUserId.value) chatMessages.value.push(msg);
				} else {
					chatMessages.value.push(msg);
				}
				if (!msg.isWhisper || isGM.value || msg.senderId === currentUserId.value) await scrollChat();
			});

			await initRoomPlayersObserver();
			await initPartyOverview();
			subscribeToCharacterChanges();

			OBR.party.onChange(async (players) => {
				if (isGM.value) await mergePartyPlayers(players);
			});
			OBR.player.onChange(async (player) => {
				if (!isGM.value) {
					const ownSheet = player.metadata?.[PLAYER_SHEET_KEY] as CharacterSheet | undefined;
					if (ownSheet?.type === 'pj') {
						upsertPartySheet(ownSheet);
						currentSheetTokenId.value = ownSheet.id;
					}
				}
			});
			OBR.room.onMetadataChange(async () => {
				if (!isSavingLocally) await loadSelection();
			});

			await loadSelection();
			isReady.value = true;
		});
	}

	async function initializeTokenSheet(tokenId: string) {
		if (!isGM.value) return;

		const items = await OBR.scene.items.getItems([tokenId]);
		const item = items[0];

		if (!item) return;

		const baseName = (item.name || 'Monstre').trim();
		let finalName = baseName;

		// Compter les monstres déjà présents dans Supabase
		const sameNameCount = partySheets.value.filter(
			(entry) => entry.type === 'monster' && (entry.name === baseName || entry.name.startsWith(`${baseName} `)),
		).length;

		if (sameNameCount > 0) {
			finalName = `${baseName} ${sameNameCount + 1}`;

			await OBR.scene.items.updateItems([tokenId], (itemsToUpdate) => {
				for (const it of itemsToUpdate) {
					it.name = finalName;
				}
			});
		}

		const monsterSheet: CharacterSheet = {
			id: tokenId,
			type: 'monster',
			name: finalName,
			species: 'Aucune',
			ownerIds: [],
			stats: {
				force: 10,
				dexterite: 10,
				intellect: 10,
				sagesse: 10,
			},
			weaponXp: { ...DEFAULT_WEAPON_XP },
			hpCurrent: 20,
			hpMax: 20,
			peCurrent: 10,
			peMax: 10,
			wounds: [false, false, false, false, false, false],
			corruption: 0,
			ec: 0,
			spells: [],
			weapons: [],
			armors: [],
			feats: [],
			inventory: [],
			subTabOrder: [],
		};

		try {
			// L'identifiant du pion sert de legacyId pour ce monstre
			await saveSupabaseCharacter(tokenId, monsterSheet);

			currentSheetTokenId.value = tokenId;

			await initPartyOverview();
			await loadSelection();
		} catch (error) {
			console.error('Erreur lors de la création du monstre :', error);
			alert('Impossible de créer la fiche du monstre dans Supabase.');
		}
	}

	async function sendChatMessage(
		text: string,
		isWhisper: boolean = false,
		isRoll: boolean = false,
		logEntry?: DiceRollLog,
	) {
		if (!text || text.trim() === '') return;

		const now = new Date();
		const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
		const infos = logEntry?.isCritFailure
			? 'Echec critique: Gagnez 1 point de corruption et Perdez 1 point de Qualité sur votre arme ou Gagnez 1d6 de corruption'
			: '';

		const message: ChatMessage = {
			id: Date.now().toString(),
			senderId: currentUserId.value,
			senderName: currentUserName.value + ` (${sheet.value.name})`,
			senderColor: currentUserColor.value,
			playerName: currentUserName.value,
			characterName: sheet.value.name,
			playerColor: currentUserColor.value,
			text: text.trim(),
			label: text.trim(),
			timestamp: timeStr,
			isWhisper,
			isRoll,
			...logEntry,
			infos,
		};

		// Affichage local immédiat pour l'expéditeur
		if (!isWhisper || isGM.value || message.senderId === currentUserId.value) {
			chatMessages.value.push(message);
			await scrollChat();
		}

		// Envoi aux autres joueurs connectés
		await OBR.broadcast.sendMessage(BROADCAST_CHAT_CHANNEL, message);
	}

	async function broadcastDiceRollAsChat(rollEntry: DiceRollLog) {
		// On utilise ta fonction sendChatMessage existante en mode "jet de dé"
		await sendChatMessage(rollEntry.label, rollEntry.isSecret, true, rollEntry);
	}

	const isLoadingSheet = ref(true);
	// Drapeau pour éviter que nos propres modifications ne réinitialisent notre saisie
	let isSavingLocally = false;
	// Suivi des modifications locales en attente de sauvegarde
	// Suivi des modifications locales, séparément pour chaque personnage
	const localChangeVersions = new Map<string, number>();
	const savedChangeVersions = new Map<string, number>();

	// Dernière version de référence connue pour chaque personnage
	const baseSheetSnapshots = new Map<string, CharacterSheet>();

	function hasPendingLocalChanges(characterId: string) {
		const localVersion = localChangeVersions.get(characterId) ?? 0;
		const savedVersion = savedChangeVersions.get(characterId) ?? 0;

		return localVersion !== savedVersion;
	}

	function cloneSheet<T extends CharacterSheet>(data: T): T {
		return JSON.parse(JSON.stringify(data));
	}

	function mergeThreeWay(base: any, local: any, remote: any, path = ''): { value: any; conflicts: string[] } {
		const equal = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);

		// Le local n'a pas changé : on prend la version distante.
		if (equal(local, base)) {
			return { value: remote, conflicts: [] };
		}

		// Le distant n'a pas changé : on conserve le local.
		if (equal(remote, base) || equal(local, remote)) {
			return { value: local, conflicts: [] };
		}

		// Fusion récursive des objets, mais pas des tableaux.
		// Les tableaux modifiés des deux côtés seront traités comme un conflit.
		const isObject = (value: any) => value !== null && typeof value === 'object' && !Array.isArray(value);

		if (isObject(base) && isObject(local) && isObject(remote)) {
			const value: Record<string, any> = {};
			const conflicts: string[] = [];
			const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);

			for (const key of keys) {
				const result = mergeThreeWay(base[key], local[key], remote[key], path ? `${path}.${key}` : key);

				if (result.value !== undefined) {
					value[key] = result.value;
				}

				conflicts.push(...result.conflicts);
			}

			return { value, conflicts };
		}

		// Les deux versions ont modifié la même valeur.
		return {
			value: local,
			conflicts: [path || 'valeur inconnue'],
		};
	}

	async function loadSelection() {
		const tokenId = currentSheetTokenId.value;
		if (!tokenId || isSavingLocally) return;

		const currentCharacterId = sheet.value.id;

		if (currentCharacterId && hasPendingLocalChanges(currentCharacterId)) {
			// Annule la sauvegarde différée pour la déclencher immédiatement
			if (saveTimeoutId) {
				clearTimeout(saveTimeoutId);
				saveTimeoutId = null;
			}

			const saved = await executeSaveSheet();

			// Ne change pas de fiche si la sauvegarde a échoué
			// ou si de nouvelles modifications sont intervenues entre-temps
			if (!saved || hasPendingLocalChanges(currentCharacterId)) {
				console.warn('Changement de fiche annulé : les modifications ne sont pas toutes sauvegardées.');
				return;
			}
		}

		isLoadingSheet.value = true;

		try {
			// Retrouver la fiche associée au pion Owlbear
			const characterEntry = partySheets.value.find((entry) => entry.id === tokenId);

			if (!characterEntry?.legacyId) {
				console.warn('Aucune fiche Supabase associée à ce pion :', tokenId);
				return;
			}

			// Charger la fiche depuis Supabase
			const record = await loadCharacter(characterEntry.legacyId);

			if (record) {
				const loadedSheet = cloneSheet({
					...record.data,
					id: tokenId,
				});

				sheet.value = loadedSheet;
				baseSheetSnapshots.set(tokenId, cloneSheet(loadedSheet));
			} else {
				console.warn('Fiche introuvable dans Supabase :', tokenId);
			}
		} catch (error) {
			currentSheetTokenId.value = currentCharacterId;
			console.error('Erreur lors du chargement de la fiche :', error);
		} finally {
			isLoadingSheet.value = false;
		}
	}

	// Fonction de sauvegarde réelle
	// Fonction de sauvegarde réelle dans Supabase
	async function executeSaveSheet(): Promise<boolean> {
		if (!canEdit.value || !sheet.value.id) return false;

		isSavingLocally = true;

		try {
			const rawData = cleanSheetForSaving(toRaw(sheet.value)) as CharacterSheet;

			const changeVersion = localChangeVersions.get(rawData.id) ?? 0;

			// Retrouve l'identifiant de liaison avec Supabase
			const characterEntry = partySheets.value.find((entry) => entry.id === rawData.id);

			const legacyId = characterEntry?.legacyId;

			if (!legacyId) {
				throw new Error(`Aucun identifiant Supabase associé au pion ${rawData.id}.`);
			}

			// Sauvegarde dans Supabase
			await saveSupabaseCharacter(legacyId, rawData);

			// Actualise la liste locale des fiches
			const updatedEntry = {
				...rawData,
				legacyId,
				supabaseId: characterEntry?.supabaseId,
				supabaseOwnerIds: characterEntry?.supabaseOwnerIds ?? [],
			};

			const index = partySheets.value.findIndex((entry) => entry.id === rawData.id);

			if (index === -1) {
				partySheets.value.push(updatedEntry);
			} else {
				partySheets.value[index] = updatedEntry;
			}

			savedChangeVersions.set(rawData.id, changeVersion);
			baseSheetSnapshots.set(rawData.id, cloneSheet(rawData));

			return true;
		} catch (error) {
			console.error('Erreur lors de la sauvegarde de la fiche dans Supabase :', error);
			return false;
		} finally {
			setTimeout(() => {
				isSavingLocally = false;
			}, 300);
		}
	}

	// Applique le debounce de 400ms sur la sauvegarde
	let saveTimeoutId: ReturnType<typeof setTimeout> | null = null;

	function scheduleSaveSheet() {
		if (saveTimeoutId) clearTimeout(saveTimeoutId);

		saveTimeoutId = setTimeout(() => {
			saveTimeoutId = null;
			void executeSaveSheet();
		}, 500);
	}

	function saveSheet() {
		const characterId = sheet.value.id;
		if (!characterId) return;

		const currentVersion = localChangeVersions.get(characterId) ?? 0;
		localChangeVersions.set(characterId, currentVersion + 1);

		scheduleSaveSheet();
	}

	function parseAndRollDice(diceNotation: string): { total: number; breakdown: string } {
		let total = 0;
		const regex = /(\d*)d(\d+)/gi;
		let match;
		let modifiedNotation = diceNotation;

		while ((match = regex.exec(diceNotation)) !== null) {
			const count = match[1] ? parseInt(match[1]) : 1;
			const sides = parseInt(match[2]);
			let rollSum = 0;
			for (let i = 0; i < count; i++) {
				rollSum += Math.floor(Math.random() * sides) + 1;
			}
			modifiedNotation = modifiedNotation.replace(match[0], rollSum.toString());
		}

		try {
			total = Function(`return (${modifiedNotation})`)();
		} catch {
			total = 0;
		}

		return { total, breakdown: `${diceNotation} (${modifiedNotation})` };
	}

	// Helper pour envoyer le log et gérer la notification
	async function broadcastLog(logEntry: DiceRollLog) {
		await broadcastDiceRollAsChat(logEntry);

		// Détermination de l'icône de succès / échec pour la notification
		// let statusIcon = '';
		// if (logEntry.isSuccess === true) {
		// 	statusIcon = '✅ ';
		// } else if (logEntry.isSuccess === false) {
		// 	statusIcon = '❌ ';
		// }
		// // Détermination de critique
		// let critStatus = '';
		// if (logEntry.isCritSuccess === true) {
		// 	critStatus = ' [CRITIQUE] ';
		// } else if (logEntry.isCritFailure === true) {
		// 	critStatus = ' [ÉCHEC CRITIQUE] ';
		// }

		// Construction du texte de la notification
		// let notifText = `${statusIcon}${critStatus} ${logEntry.playerName} : ${logEntry.label}`;
		// if (logEntry.diceResult !== undefined) notifText += ` (Dé : ${logEntry.diceResult})`;

		// Notification selon le caractère secret ou public du jet
		// if (!logEntry.isSecret) {
		// 	OBR.notification.show(notifText);
		// } else if (isGM.value) {
		// 	// Le MJ voit les lancers secrets de ses joueurs avec une mention explicite
		// 	OBR.notification.show(`🔒 [SECRET] ${notifText}`);
		// } else {
		// 	// Pour les joueurs, un jet secret n'affiche pas le détail direct par discrétion
		// 	OBR.notification.show(`🔒 [SECRET] ${logEntry.playerName} a effectué un jet masqué.`);
		// }
	}

	// --- LANCER LIBRE (Dés personnalisés) ---
	// --- LANCER LIBRE (Dés personnalisés avec support multi-dés) ---
	async function rollCustomDice(
		diceType: number,
		mode: 'normal' | 'advantage' | 'disadvantage',
		bonus: number,
		customLabel: string,
		isSecret: boolean = false,
		diceCount: number = 1,
	) {
		let total = 0;
		let details = '';
		const count = Math.max(1, diceCount);

		// Si on lance un seul dé avec Avantage ou Désavantage
		if (count === 1 && mode !== 'normal') {
			const roll1 = Math.floor(Math.random() * diceType) + 1;
			const roll2 = Math.floor(Math.random() * diceType) + 1;
			let chosenRoll = roll1;
			let modeText = '';

			if (mode === 'advantage') {
				chosenRoll = Math.min(roll1, roll2);
				modeText = ` [Avantage: ${roll1}, ${roll2}]`;
			} else if (mode === 'disadvantage') {
				chosenRoll = Math.max(roll1, roll2);
				modeText = ` [Désavantage: ${roll1}, ${roll2}]`;
			}

			total = chosenRoll + bonus;
			const bonusStr = bonus !== 0 ? (bonus > 0 ? ` +${bonus}` : ` ${bonus}`) : '';
			details = `Résultat: ${chosenRoll}${bonusStr}${modeText}`;
		} else {
			// Mode normal ou multi-dés (ex: 3d6)
			const rolls: number[] = [];
			for (let i = 0; i < count; i++) {
				rolls.push(Math.floor(Math.random() * diceType) + 1);
			}
			const sum = rolls.reduce((a, b) => a + b, 0);
			total = sum + bonus;

			const bonusStr = bonus !== 0 ? (bonus > 0 ? ` +${bonus}` : ` ${bonus}`) : '';
			const rollsStr = rolls.length > 1 ? `(${rolls.join(' + ')})` : `${rolls[0]}`;
			details = `Résultat: ${rollsStr}${bonusStr}`;
		}

		const now = new Date();
		const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

		const diceNotation = count > 1 ? `${count}d${diceType}` : `d${diceType}`;
		const labelName = customLabel.trim() !== '' ? customLabel : `Jet de ${diceNotation}`;

		const logEntry: DiceRollLog = {
			id: Date.now().toString(),
			senderId: currentUserId.value,
			playerName: currentUserName.value,
			playerColor: currentUserColor.value,
			characterName: sheet.value.name || currentUserName.value,
			label: labelName,
			diceResult: total,
			details: details,
			isSecret,
			timestamp: timeStr,
		};

		await broadcastLog(logEntry);
	}

	// --- JET DE FORMULE LIBRE (ex: 2d6 + 1d4 + 3) ---
	async function executeFormulaRoll(formula: string, customLabel: string, isSecret: boolean = false) {
		if (!formula || formula.trim() === '') return;

		const parsed = parseAndRollDice(formula.trim());
		const total = parsed.total;

		const now = new Date();
		const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

		const labelName = customLabel.trim() !== '' ? customLabel : `Jet de formule`;

		const logEntry: DiceRollLog = {
			id: Date.now().toString(),
			senderId: currentUserId.value,
			playerName: currentUserName.value,
			playerColor: currentUserColor.value,
			characterName: sheet.value.name || currentUserName.value,
			label: labelName,
			diceResult: total,
			details: `Formule: ${parsed.breakdown}`,
			isSecret,
			timestamp: timeStr,
		};

		await broadcastLog(logEntry);
	}

	// --- JET D'ATTRIBUT ---
	async function rollStatCheck(statKey: StatName, statLabel: string, isSecret: boolean = false) {
		let statValue = sheet.value.stats[statKey];
		if (statKey === 'dexterite') {
			statValue += protectionPenalty.value.dexterity;
		}

		const diceResult = Math.floor(Math.random() * 20) + 1;

		const isCritSuccess = diceResult === 1;
		const isCritFailure = diceResult === 20;
		const isSuccess = isCritSuccess || (!isCritFailure && diceResult <= statValue);

		if (statLabel === 'Constitution') {
			let countWoundsToApply = isSuccess ? 0 : 1;
			sheet.value.wounds.forEach((wound, index) => {
				if (!wound && countWoundsToApply > 0) {
					sheet.value.wounds[index] = true;
					countWoundsToApply--;
				}
			});
		}

		const now = new Date();
		const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

		const logEntry: DiceRollLog = {
			id: Date.now().toString(),
			senderId: currentUserId.value,
			playerName: currentUserName.value,
			playerColor: currentUserColor.value,
			characterName: sheet.value.name,
			label: `Test de ${statLabel}`,
			statValue,
			diceResult,
			isSuccess,
			isCritSuccess,
			isCritFailure,
			isSecret,
			timestamp: timeStr,
		};

		await broadcastLog(logEntry);
	}

	// --- ARME : ATTAQUE ---
	async function rollWeaponAttack(weapon: WeaponItem, isSecret: boolean = false) {
		let statValue = sheet.value.stats[weapon.stat] || 10;
		if (weapon.stat === 'dexterite') {
			statValue += protectionPenalty.value.dexterity;
		}
		const weaponXp = sheet.value.weaponXp[weapon.weaponType] || 0;
		const rankData = getRankFromXp(weaponXp);

		const targetThreshold = statValue + rankData.hitBonus;
		const diceResult = Math.floor(Math.random() * 20) + 1;

		const isCritSuccess = diceResult === 1;
		const isCritFailure = diceResult === 20;
		const isSuccess = isCritSuccess || (!isCritFailure && diceResult <= targetThreshold);

		const now = new Date();
		const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

		const logEntry: DiceRollLog = {
			id: Date.now().toString(),
			senderId: currentUserId.value,
			playerName: currentUserName.value,
			playerColor: currentUserColor.value,
			characterName: sheet.value.name,
			label: `Attaque : ${weapon.name}`,
			statValue: targetThreshold,
			diceResult,
			isSuccess,
			isCritSuccess,
			isCritFailure,
			isSecret,
			timestamp: timeStr,
		};

		await broadcastLog(logEntry);

		if (isSuccess) {
			setTimeout(() => rollWeaponDamage(weapon, isSecret), 300);
		}
	}

	// --- ARME : DEGATS ---
	async function rollWeaponDamage(weapon: WeaponItem, isSecret: boolean = false) {
		const weaponXp = sheet.value.weaponXp[weapon.weaponType] || 0;
		const rankData = getRankFromXp(weaponXp);

		const baseDamageRoll = parseAndRollDice(weapon.damage || '1d6');

		let masteryRollTotal = 0;
		let masteryRollBreakdown = '';
		if (rankData.dice !== 'Aucun') {
			const mRoll = parseAndRollDice(rankData.dice);
			masteryRollTotal = mRoll.total;
			masteryRollBreakdown = ` + Maîtrise : ${mRoll.breakdown}`;
		}

		const totalDamage = baseDamageRoll.total + masteryRollTotal;

		const now = new Date();
		const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

		const logEntry: DiceRollLog = {
			id: Date.now().toString(),
			senderId: currentUserId.value,
			playerName: currentUserName.value,
			playerColor: currentUserColor.value,
			characterName: sheet.value.name,
			label: `Dégâts : ${weapon.name}`,
			diceResult: totalDamage,
			details: `${baseDamageRoll.breakdown}${masteryRollBreakdown}`,
			isSecret,
			timestamp: timeStr,
		};

		await broadcastLog(logEntry);
	}

	// --- SORT : INCANTATION ---
	async function rollSpellCast(spell: SpellItem, isSecret: boolean = false) {
		let statValue = sheet.value.stats[spell.stat || 'intellect'] || 10;
		if (spell.stat === 'dexterite') {
			statValue += protectionPenalty.value.dexterity;
		}
		const weaponXp = sheet.value.weaponXp[spell.weaponType || 'Magie'] || 0;
		const rankData = getRankFromXp(weaponXp);

		const targetThreshold = statValue + rankData.hitBonus;
		const diceResult = Math.floor(Math.random() * 20) + 1;

		const isCritSuccess = diceResult === 1;
		const isCritFailure = diceResult === 20;
		const isSuccess = isCritSuccess || (!isCritFailure && diceResult <= targetThreshold);

		const now = new Date();
		const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

		const logEntry: DiceRollLog = {
			id: Date.now().toString(),
			senderId: currentUserId.value,
			playerName: currentUserName.value,
			playerColor: currentUserColor.value,
			characterName: sheet.value.name,
			label: `Incantation : ${spell.name} (Coût: ${spell.peCost || 0} PE)`,
			statValue: targetThreshold,
			diceResult,
			isSuccess,
			isCritSuccess,
			isCritFailure,
			isSecret,
			timestamp: timeStr,
		};

		await broadcastLog(logEntry);

		if (isSuccess) {
			setTimeout(() => rollSpellEffect(spell, isSecret), 300);
		}
	}

	// --- SORT : EFFET ---
	async function rollSpellEffect(spell: SpellItem, isSecret: boolean = false) {
		const weaponXp = sheet.value.weaponXp[spell.weaponType || 'Magie'] || 0;
		const rankData = getRankFromXp(weaponXp);

		const weaponEquippedDamages = sheet.value.weapons
			.filter((w) => w.weaponType === spell.weaponType && w.equipped)
			.reduce((acc, w, index) => {
				if (index > 0) acc += ' + ';
				return acc + (w.damage || '1d6');
			}, '');

		let totalVal = 0;
		let detailStr = '';

		if (spell.formula && spell.formula.trim() !== '') {
			const baseRoll = parseAndRollDice(spell.formula);
			const weaponRoll = parseAndRollDice(weaponEquippedDamages || '1d6');
			let masteryRollTotal = 0;
			let masteryRollBreakdown = '';

			if (rankData.dice !== 'Aucun') {
				const mRoll = parseAndRollDice(rankData.dice);
				masteryRollTotal = mRoll.total;
				masteryRollBreakdown = ` + Maîtrise : ${mRoll.breakdown}`;
			}

			totalVal = baseRoll.total + masteryRollTotal + weaponRoll.total;
			detailStr = `${baseRoll.breakdown} + Armes : ${weaponRoll.breakdown}${masteryRollBreakdown}`;
		} else {
			detailStr = spell.description || 'Effet déclenché.';
		}

		const now = new Date();
		const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

		const logEntry: DiceRollLog = {
			id: Date.now().toString(),
			senderId: currentUserId.value,
			playerName: currentUserName.value,
			playerColor: currentUserColor.value,
			characterName: sheet.value.name,
			label: `Effet / Dégâts : ${spell.name}`,
			diceResult: totalVal > 0 ? totalVal : undefined,
			details: detailStr,
			isSecret,
			timestamp: timeStr,
		};

		await broadcastLog(logEntry);
	}

	async function addWeapon() {
		if (!canEdit.value) return;
		sheet.value.weapons.push({
			id: Date.now().toString(),
			name: 'Nouvelle Arme',
			damage: '1d6',
			quality: 'Normale',
			weaponType: 'Epee',
			stat: 'force',
			description: '',
		});
		await saveSheet();
	}
	async function removeWeapon(id: string) {
		if (!canEdit.value) return;
		sheet.value.weapons = sheet.value.weapons.filter((w) => w.id !== id);
		await saveSheet();
	}

	async function addArmor() {
		if (!canEdit.value) return;
		sheet.value.armors.push({
			id: Date.now().toString(),
			name: 'Nouvelle Armure',
			protection: 1,
			dexMalus: 0,
			description: '',
		});
		await saveSheet();
	}
	async function removeArmor(id: string) {
		if (!canEdit.value) return;
		sheet.value.armors = sheet.value.armors.filter((a) => a.id !== id);
		await saveSheet();
	}

	async function addSpell() {
		if (!canEdit.value) return;
		sheet.value.spells.push({
			id: Date.now().toString(),
			name: 'Nouveau Sort',
			level: 1,
			range: 'Touché',
			peCost: 2,
			stat: 'intellect',
			weaponType: 'Magie',
			formula: '1d6',
			description: '',
		});
		await saveSheet();
	}
	async function removeSpell(id: string) {
		if (!canEdit.value) return;
		sheet.value.spells = sheet.value.spells.filter((s) => s.id !== id);
		await saveSheet();
	}

	async function addFeat() {
		if (!canEdit.value) return;
		sheet.value.feats.push({ id: Date.now().toString(), name: 'Nouveau Don', effect: '' });
		await saveSheet();
	}
	async function removeFeat(id: string) {
		if (!canEdit.value) return;
		sheet.value.feats = sheet.value.feats.filter((f) => f.id !== id);
		await saveSheet();
	}

	async function addInventoryItem() {
		if (!canEdit.value) return;
		sheet.value.inventory.push({ id: Date.now().toString(), name: 'Nouvel Objet', quantity: 1, description: '' });
		await saveSheet();
	}
	async function removeInventoryItem(id: string) {
		if (!canEdit.value) return;
		sheet.value.inventory = sheet.value.inventory.filter((item) => item.id !== id);
		await saveSheet();
	}

	async function applyEstimatedHpMax() {
		if (!canEdit.value) return;
		sheet.value.hpMax = estimatedHpMax.value;
		await saveSheet();
	}
	async function applyEstimatedPeMax() {
		if (!canEdit.value) return;
		sheet.value.peMax = estimatedPeMax.value;
		await saveSheet();
	}
	async function toggleWound(index: number) {
		if (!canEdit.value) return;
		sheet.value.wounds[index] = !sheet.value.wounds[index];
		await saveSheet();
	}
	async function updateHp(delta: number) {
		if (!canEdit.value) return;
		sheet.value.hpCurrent = Math.min(sheet.value.hpMax, Math.max(0, sheet.value.hpCurrent + delta));
		await saveSheet();
	}
	async function updatePe(delta: number) {
		if (!canEdit.value) return;
		sheet.value.peCurrent = Math.min(sheet.value.peMax, Math.max(0, sheet.value.peCurrent + delta));
		await saveSheet();
	}

	async function handleUseConsumable(item: any, isSecret: boolean) {
		const currentQty = item.quantity ?? 1;
		if (currentQty <= 0) return;

		// Décrémente et sauvegarde
		item.quantity = currentQty - 1;
		await saveSheet();

		if (item.formula) {
			const formula = item.formula.trim();
			const match = formula.match(/^(\d*)d(\d+)([\+\-]\d+)?$/i);

			let total = 0;
			let diceDetails = '';

			if (match) {
				const count = match[1] ? parseInt(match[1], 10) : 1;
				const faces = parseInt(match[2], 10);
				const bonus = match[3] ? parseInt(match[3], 10) : 0;

				const rolls: number[] = [];
				for (let i = 0; i < count; i++) {
					rolls.push(Math.floor(Math.random() * faces) + 1);
				}
				const sum = rolls.reduce((a, b) => a + b, 0);
				total = sum + bonus;
				diceDetails =
					rolls.length > 1 ? `${rolls.join('+')}${bonus ? (bonus > 0 ? '+' + bonus : bonus) : ''}` : `${rolls[0]}`;
			} else {
				const flatValue = parseInt(formula, 10);
				total = !isNaN(flatValue) ? flatValue : 0;
				diceDetails = `${total}`;
			}

			const now = new Date();
			const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

			await broadcastLog({
				id: Math.random().toString(),
				senderId: currentUserId.value,
				playerName: currentUserName.value,
				playerColor: currentUserColor.value,
				characterName: sheet.value.name || 'Personnage',
				label: `Utilisation : ${item.name} (${formula})`,
				diceResult: total > 0 ? total : undefined,
				details: diceDetails,
				isSecret,
				timestamp: timeStr,
			});
		}
	}

	// --- EXPORT ---
	function exportCharacterSheet() {
		if (!sheet.value || !sheet.value.name) return;

		// Création d'une copie propre de la fiche courante
		const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(sheet.value, null, 2));

		// Création d'un lien de téléchargement invisible
		const downloadAnchor = document.createElement('a');
		downloadAnchor.setAttribute('href', dataStr);

		// Nom du fichier basé sur le nom du personnage (nettoyé des espaces)
		const safeName = sheet.value.name.trim().toLowerCase().replace(/\s+/g, '_');
		downloadAnchor.setAttribute('download', `fiche_${safeName}.json`);

		document.body.appendChild(downloadAnchor);
		downloadAnchor.click();
		downloadAnchor.remove();
	}

	// --- IMPORT ---
	async function importCharacterSheet(event: Event) {
		const target = event.target as HTMLInputElement;
		const file = target.files?.[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = async (e) => {
			try {
				const content = e.target?.result as string;
				const importedData = JSON.parse(content);

				// Vérification basique de la structure (ex: présence d'un nom et de stats)
				if (!importedData || !importedData.name || !importedData.stats) {
					alert('Format de fichier invalide pour une fiche de personnage.');
					return;
				}

				// On injecte les données dans la fiche actuelle tout en gardant l'ID du token courant
				const importedType: 'pj' | 'monster' = isGM.value ? 'monster' : 'pj';
				sheet.value = {
					...importedData,
					id: sheet.value.id, // Conserve l'identifiant de la fiche active
					type: importedType,
					ownerIds: importedType === 'pj' ? [currentUserId.value] : [],
				};

				// Sauvegarde automatique dans les métadonnées de la Room pour propager le changement
				await saveSheet();
				alert(`Fiche de "${sheet.value.name}" importée avec succès !`);
			} catch (err) {
				console.error('Erreur lors de la lecture du JSON :', err);
				alert('Erreur lors de la lecture du fichier JSON.');
			} finally {
				// Réinitialise l'input file pour permettre de réimporter le même fichier si besoin
				target.value = '';
			}
		};
		reader.readAsText(file);
	}

	// Les fiches PJ sont créées une fois par joueur et stockées dans ses métadonnées personnelles.
	// Le MJ ne reçoit que les fiches des joueurs actuellement connectés via OBR.party.getPlayers().
	const partySheets = ref<CharacterSheetWithLegacyId[]>([]);

	function upsertPartySheet(character: CharacterSheet) {
		const index = partySheets.value.findIndex((entry) => entry.id === character.id);
		if (index === -1) partySheets.value.push(cloneSheet(character));
		else partySheets.value[index] = cloneSheet(character);
	}

	async function mergePartyPlayers(_players: any[]) {
		if (!isGM.value) return;

		// Supabase est désormais la source de vérité
		await initPartyOverview();
	}

	async function initPartyOverview() {
		try {
			const records = await listCharacters();

			partySheets.value = records.map((record) => ({
				...record.data,
				id: record.data.id,
				legacyId: record.legacyId,
				supabaseId: record.id,
				supabaseOwnerIds: record.supabaseOwnerIds,
			}));
		} catch (error) {
			console.error('Erreur lors du chargement des fiches Supabase :', error);
		}
	}

	let charactersChannel: ReturnType<typeof supabase.channel> | null = null;

	function subscribeToCharacterChanges() {
		// Évite de créer plusieurs abonnements
		if (charactersChannel) {
			supabase.removeChannel(charactersChannel);
			charactersChannel = null;
		}

		const campaignId = campaign.value?.id;

		if (!campaignId) {
			console.warn('Impossible de démarrer Realtime : aucune campagne sélectionnée.');
			return;
		}

		charactersChannel = supabase
			.channel(`characters-${campaignId}`)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'characters',
					filter: `campaign_id=eq.${campaignId}`,
				},
				async (payload) => {
					console.log('[Realtime] Événement reçu :', payload.eventType, payload);
					// Synchronisation des suppressions
					if (payload.eventType === 'DELETE') {
						const deletedRow = payload.old as {
							id?: string;
						};

						if (!deletedRow.id) {
							console.warn('Suppression Realtime ignorée : identifiant Supabase introuvable.', payload.old);
							return;
						}

						const deletedEntry = partySheets.value.find((entry) => entry.supabaseId === deletedRow.id);

						if (!deletedEntry) return;

						partySheets.value = partySheets.value.filter((entry) => entry.supabaseId !== deletedRow.id);

						baseSheetSnapshots.delete(deletedEntry.id);
						localChangeVersions.delete(deletedEntry.id);
						savedChangeVersions.delete(deletedEntry.id);

						if (currentSheetTokenId.value === deletedEntry.id) {
							currentSheetTokenId.value = null;
							sheet.value.id = '';
						}

						return;
					}

					const row = payload.new as {
						legacy_id?: string;
					};

					if (!row.legacy_id) return;

					// Retrouve la fiche concernée dans notre liste locale.
					const existingEntry = partySheets.value.find((entry) => entry.legacyId === row.legacy_id);

					if (!existingEntry) {
						await initPartyOverview();
						return;
					}

					try {
						if (isSavingLocally) return;

						const record = await loadCharacter(row.legacy_id);

						if (!record) return;

						const isCurrentSheet = currentSheetTokenId.value === existingEntry.id;
						const hasLocalChanges = hasPendingLocalChanges(existingEntry.id);

						const remoteSheet = cloneSheet({
							...record.data,
							id: existingEntry.id,
						});

						let updatedSheet = remoteSheet;

						if (hasLocalChanges) {
							const baseSheet = baseSheetSnapshots.get(existingEntry.id);

							if (!baseSheet) {
								console.warn('Fusion impossible : aucune version de référence disponible.');
								return;
							}

							const localSheet = cloneSheet(isCurrentSheet ? sheet.value : existingEntry);

							const result = mergeThreeWay(baseSheet, localSheet, remoteSheet);

							updatedSheet = result.value as CharacterSheet;

							if (result.conflicts.length > 0) {
								console.warn(
									'Conflits de modification détectés. Les valeurs locales ont été conservées :',
									result.conflicts,
								);
							}
						}

						// La nouvelle référence devient la dernière version distante connue.
						baseSheetSnapshots.set(existingEntry.id, cloneSheet(remoteSheet));

						const updatedEntry = {
							...updatedSheet,
							legacyId: existingEntry.legacyId,
							supabaseOwnerIds: existingEntry.supabaseOwnerIds,
						};

						const index = partySheets.value.findIndex((entry) => entry.legacyId === row.legacy_id);

						if (index !== -1) {
							partySheets.value[index] = updatedEntry;
						}

						if (isCurrentSheet && !isLoadingSheet.value) {
							sheet.value = cloneSheet(updatedSheet);
						}

						// Si des changements locaux ont été conservés, on sauvegarde
						// la fiche fusionnée avec la nouvelle version distante.
						if (hasLocalChanges) {
							scheduleSaveSheet();
						}
					} catch (error) {
						console.error('Erreur lors de la synchronisation Realtime :', error);
					}
				},
			)
			.subscribe((status) => {
				console.log('Statut Realtime :', status);
			});
	}

	async function createPlayerCharacter(name: string): Promise<void> {
		if (isGM.value) {
			throw new Error('Seul un joueur peut créer son personnage depuis cette fonction.');
		}

		const userId = user.value?.id;

		if (!userId) {
			throw new Error('Aucun compte Supabase connecté.');
		}

		const characterName = name.trim();

		if (!characterName) {
			throw new Error('Le nom du personnage est obligatoire.');
		}

		// Empêche la création de plusieurs fiches pour le même compte
		const existingCharacter = partySheets.value.find((entry) => entry.supabaseOwnerIds?.includes(userId));

		if (existingCharacter) {
			throw new Error('Tu possèdes déjà une fiche dans cette campagne.');
		}

		// Identifiant stable, indépendant des pions Owlbear
		const legacyId = `pj-${userId}`;

		const playerSheet: CharacterSheet = {
			id: legacyId,
			type: 'pj',
			name: characterName,
			species: 'Aucune',
			ownerIds: [],
			stats: {
				force: 10,
				dexterite: 10,
				intellect: 10,
				sagesse: 10,
			},
			weaponXp: { ...DEFAULT_WEAPON_XP },
			hpCurrent: 30,
			hpMax: 30,
			peCurrent: 40,
			peMax: 40,
			wounds: [false, false, false, false, false, false],
			corruption: 0,
			ec: 0,
			spells: [],
			weapons: [],
			armors: [],
			feats: [],
			inventory: [],
			subTabOrder: [],
		};

		// Création dans Supabase et attribution au compte connecté
		await saveSupabaseCharacter(legacyId, playerSheet);

		// Recharge les fiches depuis Supabase
		await initPartyOverview();

		// Sélectionne le personnage nouvellement créé
		currentSheetTokenId.value = legacyId;
		await loadSelection();
	}

	function cleanSheetForSaving(sheetData: any) {
		const clean = JSON.parse(JSON.stringify(sheetData));
		clean.weapons = (clean.weapons || []).map((w: any) => {
			if (!w.description) delete w.description;
			return w;
		});
		clean.spells = (clean.spells || []).map((spell: any) => {
			if (!spell.description) delete spell.description;
			return spell;
		});
		clean.inventory = (clean.inventory || []).map((item: any) => {
			if (!item.description) delete item.description;
			if (!item.formula) delete item.formula;
			return item;
		});
		return clean;
	}

	async function saveCharacter(character: any) {
		if (!character || character.type !== 'monster' || !isGM.value) return;

		try {
			const rawData = cleanSheetForSaving(character) as CharacterSheet;

			// Retrouve l'identifiant de liaison Supabase
			const characterEntry = partySheets.value.find((entry) => entry.id === rawData.id);

			const legacyId = character.legacyId || characterEntry?.legacyId;

			if (!legacyId) {
				throw new Error(`Aucun identifiant Supabase associé au monstre ${rawData.name}.`);
			}

			// Sauvegarde dans Supabase
			await saveSupabaseCharacter(legacyId, rawData);

			// Actualise la liste locale
			const updatedEntry = {
				...rawData,
				legacyId,
				supabaseId: characterEntry?.supabaseId,
			};

			const index = partySheets.value.findIndex((entry) => entry.id === rawData.id);

			if (index === -1) {
				partySheets.value.push(updatedEntry);
			} else {
				partySheets.value[index] = updatedEntry;
			}
		} catch (error) {
			console.error('Erreur lors de la sauvegarde du monstre dans Supabase :', error);
		}
	}

	async function deleteMetadata(character: any) {
		if (!isGM.value || !character?.id) return;

		try {
			// Retrouve l'identifiant de liaison avec Supabase
			const characterEntry = partySheets.value.find((entry) => entry.id === character.id);

			const legacyId = character.legacyId || characterEntry?.legacyId;

			if (!legacyId) {
				throw new Error(`Aucun identifiant Supabase associé au monstre ${character.name}.`);
			}

			// Supprime la fiche dans Supabase
			await deleteSupabaseCharacter(legacyId);

			// Actualise la liste locale
			partySheets.value = partySheets.value.filter((entry) => entry.id !== character.id);

			// Ferme la fiche si elle était ouverte
			if (currentSheetTokenId.value === character.id) {
				currentSheetTokenId.value = null;
				sheet.value.id = '';
			}
		} catch (error) {
			console.error('Erreur lors de la suppression du monstre dans Supabase :', error);
		}
	}

	async function focusAndSelectToken(tokenId: string) {
		if (!tokenId) return;
		currentSheetTokenId.value = tokenId;
		await loadSelection();
	}

	return {
		isReady,
		isGM,
		canEdit,
		sheet,
		knownPlayers,
		currentSpeciesData,
		estimatedHpMax,
		estimatedPeMax,
		dodgePenalty,
		protectionPenalty,
		corruptionStatus,
		chatMessages,
		availableTokens,
		currentSheetTokenId,
		partySheets,
		isLoadingSheet,
		init,
		saveSheet,
		rollStatCheck,
		rollWeaponAttack,
		rollWeaponDamage,
		rollSpellCast,
		rollSpellEffect,
		rollCustomDice,
		dodgePenaltyChar,
		protectionPenaltyChar,
		executeFormulaRoll,
		addWeapon,
		removeWeapon,
		addArmor,
		removeArmor,
		addSpell,
		removeSpell,
		addFeat,
		removeFeat,
		addInventoryItem,
		removeInventoryItem,
		applyEstimatedHpMax,
		applyEstimatedPeMax,
		toggleWound,
		updateHp,
		updatePe,
		handleUseConsumable,
		sendChatMessage,
		initPartyOverview,
		createPlayerCharacter,
		deleteMetadata,
		saveCharacter,
		focusAndSelectToken,
		changeActiveToken,
		initializeTokenSheet,
		exportCharacterSheet,
		importCharacterSheet,
	};
}
