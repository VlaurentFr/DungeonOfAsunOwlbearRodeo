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

const BROADCAST_CHAT_CHANNEL = 'com.homebrew.sheet/chat_messages';

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
	const canEdit = computed(() => isGM.value || sheet.value.ownerIds.includes(currentUserId.value));

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

	// Liste filtrée des tokens disponibles
	const availableTokens = computed(() => {
		if (isGM.value) {
			return partySheets.value; // Le MJ voit toutes les fiches de la scène
		}

		// Pour un joueur classique : on garde uniquement les fiches où son ID figure dans 'ownerIds'
		return partySheets.value.filter((char) => char.ownerIds && char.ownerIds.includes(currentUserId.value));
	});

	async function changeActiveToken(tokenId: string | null) {
		currentSheetTokenId.value = tokenId;
		await loadSelection();
		// Optionnel : si tu veux aussi synchroniser avec la sélection sur la carte d'Owlbear Rodeo
		// await OBR.scene.items.select([tokenId]);
	}
	// Fonction utilitaire de debounce pour éviter les écritures simultanées en rafale
	function debounce<T extends (...args: any[]) => any>(fn: T, delay: number): (...args: Parameters<T>) => void {
		let timeoutId: ReturnType<typeof setTimeout> | null = null;
		return (...args: Parameters<T>) => {
			if (timeoutId) clearTimeout(timeoutId);
			timeoutId = setTimeout(() => {
				fn(...args);
			}, delay);
		};
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
				// Si c'est un chuchotement (whisper), on ne l'affiche que si on est l'expéditeur ou le MJ
				if (msg.isWhisper) {
					if (isGM.value || msg.senderId === currentUserId.value) {
						chatMessages.value.push(msg);
					}
				} else {
					chatMessages.value.push(msg);
				}

				if (!msg.isWhisper || isGM.value || msg.senderId === currentUserId.value) {
					await scrollChat(); // <-- On déclenche le scroll ici pour les autres
				}
			});

			initRoomPlayersObserver();

			initPartyOverview();

			// Écoute les changements globaux de la room pour synchroniser en direct
			OBR.room.onMetadataChange(async (metadata) => {
				updatePartyListFromMetadata(metadata);

				// Si le joueur est en train de modifier/sauvegarder activement, on ignore le refresh distant immédiat
				if (!isSavingLocally) {
					await loadSelection();
				}
			});

			await loadSelection();
			isReady.value = true;
		});
	}

	// Fonction d'initialisation adaptée avec choix du type
	async function initializeTokenSheet(tokenId: string, sheetType: 'pj' | 'monster') {
		const items = await OBR.scene.items.getItems([tokenId]);
		const item = items[0];
		if (!item) return;

		const baseName = (item.name || (sheetType === 'pj' ? 'Nouveau Joueur' : 'Monstre')).trim();
		const cleanName = baseName.toLowerCase().replace(/\s+/g, '_');

		const roomMetadata = await OBR.room.getMetadata();
		let roomMetadataKey = '';
		let finalName = baseName;

		if (sheetType === 'pj') {
			// Clé basée sur le NOM du joueur (persistance inter-scènes)
			roomMetadataKey = `character_sheet_${cleanName}`;
			if (roomMetadata[roomMetadataKey]) {
				console.warn('Une fiche de Joueur existe déjà avec ce nom.');
			}
		} else {
			// Clé basée sur le TOKEN ID du monstre (indépendance totale des PV)
			roomMetadataKey = `character_sheet_monster_${tokenId}`;

			// Compteur cosmétique pour le nom sur la carte (ex: Gobelin 1, Gobelin 2)
			let counter = 1;
			const existingMonsterKeys = Object.keys(roomMetadata).filter((k) => k.startsWith('character_sheet_monster_'));
			const sameNameCount = existingMonsterKeys.filter((k) => {
				const data = roomMetadata[k] as any;
				return data && data.name && data.name.startsWith(baseName);
			}).length;

			if (sameNameCount > 0) {
				counter = sameNameCount + 1;
				finalName = `${baseName} ${counter}`;
				// On met à jour le nom du pion sur la carte OBR
				await OBR.scene.items.updateItems([tokenId], (itemsToUpdate) => {
					for (const it of itemsToUpdate) {
						it.name = finalName;
					}
				});
			}
		}

		// Fiche par défaut
		const defaultSheet: CharacterSheet = {
			id: tokenId,
			type: sheetType,
			name: finalName,
			species: 'Aucune',
			professionName: '',
			professionDescription: '',
			ownerIds: [],
			stats: { force: 10, dexterite: 10, intellect: 10, sagesse: 10 },
			weaponXp: { ...DEFAULT_WEAPON_XP },
			hpCurrent: sheetType === 'pj' ? 30 : 20,
			hpMax: sheetType === 'pj' ? 30 : 20,
			peCurrent: sheetType === 'pj' ? 40 : 10,
			peMax: sheetType === 'pj' ? 40 : 10,
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

		// Enregistrement dans la Room
		await OBR.room.setMetadata({
			[roomMetadataKey]: defaultSheet,
		});

		currentSheetTokenId.value = tokenId;
		await loadSelection();
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

	async function loadSelection() {
		const tokenId = currentSheetTokenId.value;
		if (!tokenId) return;

		// Si une sauvegarde locale est en cours, on ne recharge pas pour ne pas casser la saisie
		if (isSavingLocally) return;

		if (!sheet.value.id) {
			isLoadingSheet.value = true;
		}

		const roomMetadata = await OBR.room.getMetadata();

		let savedData = roomMetadata[`character_sheet_monster_${tokenId}`] as Partial<CharacterSheet> | null;

		if (!savedData) {
			const char = availableTokens.value.find((c: any) => c.id === tokenId);
			if (char && char.name) {
				const tokenName = char.name.trim();
				const cleanName = tokenName.toLowerCase();
				savedData = roomMetadata[`character_sheet_${cleanName}`] as Partial<CharacterSheet> | null;
			}
		}

		if (savedData) {
			sheet.value = JSON.parse(
				JSON.stringify({
					...savedData,
					id: tokenId,
				}),
			);
		}

		isLoadingSheet.value = false;
	}

	// Fonction de sauvegarde réelle
	async function executeSaveSheet() {
		if (!canEdit.value) return;
		isSavingLocally = true;
		const rawData = JSON.parse(JSON.stringify(toRaw(sheet.value)));

		const charName = (sheet.value.name || 'personnage').trim().toLowerCase();
		let roomMetadataKey = `character_sheet_${charName}`;
		if (sheet.value.type === 'monster') {
			roomMetadataKey = `character_sheet_monster_${sheet.value.id}`;
		}

		try {
			await OBR.room.setMetadata({
				[roomMetadataKey]: rawData,
			});
		} catch (e) {
			console.error('Erreur lors de la sauvegarde de la fiche:', e);
		} finally {
			// On libère le verrou après un court instant
			setTimeout(() => {
				isSavingLocally = false;
			}, 300);
		}
	}

	// Applique le debounce de 400ms sur la sauvegarde
	const saveSheet = debounce(executeSaveSheet, 400);
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

	async function toggleOwner(playerId: string) {
		if (!isGM.value) return;

		const list = [...sheet.value.ownerIds];
		const index = list.indexOf(playerId);
		let newPrimaryOwner = '';

		if (index === -1) {
			// 1. On AJOUTE le joueur aux propriétaires de la fiche
			list.push(playerId);
			newPrimaryOwner = playerId; // On lui donne le contrôle du token
		} else {
			// 2. On RETIRE le joueur des propriétaires
			list.splice(index, 1);
			// S'il reste d'autres owners, on prend le premier, sinon on redonne la main au MJ
			newPrimaryOwner = list.length > 0 ? list[0] : currentUserId.value;
		}

		// Mettre à jour la fiche locale
		sheet.value.ownerIds = list;

		// --- SYNCHRONISATION DU TOKEN SUR LA SCÈNE ---
		if (sheet.value.id) {
			await OBR.scene.items.updateItems([sheet.value.id], (items) => {
				for (const item of items) {
					// Applique le nouvel utilisateur principal qui peut déplacer le jeton
					item.createdUserId = newPrimaryOwner;
				}
			});
		}

		// Sauvegarde de la fiche dans room.metadata
		await saveSheet();
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
				sheet.value = {
					...importedData,
					id: sheet.value.id, // Conserve l'ID du token actif sur la scène
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

	// Liste de toutes les fiches des personnages présents dans la salle
	const partySheets = ref<any[]>([]);

	// Fonction pour charger / écouter les fiches de la room
	async function initPartyOverview() {
		const metadata = await OBR.room.getMetadata();
		// Supposons que tu stockes tes fiches sous une clé structurée comme "com.homebrew.sheet/character_*"
		// Ou tu peux parser les métadonnées de la room :
		updatePartyListFromMetadata(metadata);
	}

	function updatePartyListFromMetadata(metadata: any) {
		const sheets: any[] = [];
		for (const key in metadata) {
			if (key.startsWith('character_sheet_') && metadata[key] !== undefined && metadata[key] !== null) {
				sheets.push(metadata[key]);
			}
		}
		partySheets.value = sheets;
	}

	async function saveCharacter(character: any) {
		const rawData = JSON.parse(JSON.stringify(toRaw(character)));

		// Utilisation du nom du personnage pour créer une clé globale stable
		const charName = (character.name || 'personnage').trim().toLowerCase();
		let roomMetadataKey = `character_sheet_${charName}`;
		if (character.type === 'monster') {
			roomMetadataKey = `character_sheet_monster_${character.id}`;
		}

		// 1. Sauvegarde globale dans la Room (partagée entre toutes les scènes et tous les tokens du même nom)
		await OBR.room.setMetadata({
			[roomMetadataKey]: rawData,
		});
	}

	async function deleteMetadata(character: any) {
		const charName = (character.name || 'personnage').trim().toLowerCase();

		let roomMetadataKey = `character_sheet_${charName}`;
		if (character.type === 'monster') {
			roomMetadataKey = `character_sheet_monster_${character.id}`;
		}
		// const roomMetadataKey = `character_sheet_undead 1_1`;
		// const roomMetadata = await OBR.room.getMetadata();
		// console.log('delete', roomMetadata, charName);

		await OBR.room.setMetadata({
			[roomMetadataKey]: undefined,
		});
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
		toggleOwner,
		handleUseConsumable,
		sendChatMessage,
		initPartyOverview,
		updatePartyListFromMetadata,
		deleteMetadata,
		saveCharacter,
		focusAndSelectToken,
		changeActiveToken,
		initializeTokenSheet,
		exportCharacterSheet,
		importCharacterSheet,
	};
}
