import { ref, computed, toRaw } from 'vue';
import OBR from '@owlbear-rodeo/sdk';
import {
	type CharacterSheet,
	type RoomPlayer,
	type StatName,
	type WeaponType,
	type DiceRollLog,
	type WeaponItem,
	type SpellItem,
	getRankFromXp,
	SPECIES_DATA,
} from '../types/character';

const METADATA_KEY = 'com.homebrew.sheet/characterData';
const BROADCAST_DICE_CHANNEL = 'com.homebrew.sheet/dice_rolls';
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
	const selectedTokenId = ref<string | null>(null);
	const roomPlayers = ref<RoomPlayer[]>([]);

	const rollLogs = ref<DiceRollLog[]>([]);
	const chatMessages = ref<ChatMessage[]>([]);

	const sheet = ref<CharacterSheet>({
		id: '',
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

	const corruptionStatus = computed(() => {
		const c = sheet.value.corruption;
		if (c >= 20) return { level: 'Perdu', class: 'status-perdu', effect: 'Devient PNJ' };
		if (c >= 16) return { level: 'Sombre', class: 'status-sombre', effect: '+2 Magie, -3 Charisme | Repos ≠ Soin' };
		if (c >= 6) return { level: 'Entaché', class: 'status-entache', effect: '+1 Magie, -1 Charisme' };
		return { level: 'Pur', class: 'status-pur', effect: 'Aucun effet' };
	});

	async function init(scrollToBottom: () => Promise<void>) {
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
					await scrollToBottom(); // <-- On déclenche le scroll ici pour les autres
				}
			});

			OBR.party.onChange((players) => {
				roomPlayers.value = players.map((p) => ({
					id: p.id,
					name: p.name,
					color: p.color,
					role: p.role,
				}));
				const me = players.find((p) => p.id === currentUserId.value);
				if (me) {
					currentUserName.value = me.name;
					currentUserColor.value = me.color;
				}
			});

			OBR.player.onChange(async () => {
				await loadSelection();
			});

			initPartyOverview();

			// Écoute les changements globaux de la room pour synchroniser en direct
			OBR.room.onMetadataChange(async (metadata) => {
				await loadSelection();
				updatePartyListFromMetadata(metadata);
			});

			const initialPlayers = await OBR.party.getPlayers();
			roomPlayers.value = initialPlayers.map((p) => ({
				id: p.id,
				name: p.name,
				color: p.color,
				role: p.role,
			}));

			// FILTRAGE DES LOGS SECRETS
			OBR.broadcast.onMessage(BROADCAST_DICE_CHANNEL, (event) => {
				const log = event.data as DiceRollLog;
				if (log.isSecret) {
					// Visible uniquement par le MJ ou par l'auteur du jet
					if (isGM.value || log.senderId === currentUserId.value) {
						rollLogs.value.unshift(log);
					}
				} else {
					rollLogs.value.unshift(log);
				}
			});

			OBR.player.onChange(async () => {
				await loadSelection();
			});

			await loadSelection();
			isReady.value = true;
		});
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
		}

		// Envoi aux autres joueurs connectés
		await OBR.broadcast.sendMessage(BROADCAST_CHAT_CHANNEL, message);
	}

	async function broadcastDiceRollAsChat(rollEntry: DiceRollLog) {
		// On utilise ta fonction sendChatMessage existante en mode "jet de dé"
		await sendChatMessage(rollEntry.label, rollEntry.isSecret, true, rollEntry);
	}

	async function loadSelection() {
		const selection = await OBR.player.getSelection();

		if (selection && selection.length === 1) {
			const tokenId = selection[0];
			const items = await OBR.scene.items.getItems(selection);
			const item = items[0];

			if (!item) {
				selectedTokenId.value = null;
				return;
			}

			const isCharacterToken = item.layer === 'CHARACTER' || item.layer === 'MOUNT';

			if (!isCharacterToken) {
				selectedTokenId.value = null;
				return;
			}

			selectedTokenId.value = tokenId;

			// Détermination de la clé basée sur le nom du pion sur la carte
			const tokenName = (item.name || 'Nouveau Personnage').trim().toLowerCase();
			const roomMetadataKey = `character_sheet_${tokenName}`;

			// Récupération des métadonnées globales de la Room
			const roomMetadata = await OBR.room.getMetadata();
			const savedData = (roomMetadata[roomMetadataKey] ||
				(item.metadata ? item.metadata[METADATA_KEY] : null)) as Partial<CharacterSheet> | null;

			if (savedData) {
				sheet.value = {
					id: tokenId,
					name: savedData.name || item.name || 'Nouveau Personnage',
					species: savedData.species || 'Aucune',
					professionName: savedData.professionName || '',
					professionDescription: savedData.professionDescription || '',
					ownerIds: savedData.ownerIds ? [...savedData.ownerIds] : [],
					stats: {
						force: savedData.stats?.force ?? 10,
						dexterite: savedData.stats?.dexterite ?? 10,
						intellect: savedData.stats?.intellect ?? 10,
						sagesse: savedData.stats?.sagesse ?? 10,
					},
					weaponXp: { ...DEFAULT_WEAPON_XP, ...(savedData.weaponXp || {}) },
					hpCurrent: savedData.hpCurrent ?? 30,
					hpMax: savedData.hpMax ?? 30,
					peCurrent: savedData.peCurrent ?? 40,
					peMax: savedData.peMax ?? 40,
					wounds:
						savedData.wounds && savedData.wounds.length === 6
							? savedData.wounds
							: [false, false, false, false, false, false],
					corruption: savedData.corruption ?? 0,
					ec: savedData.ec ?? 0,
					spells: savedData.spells || [],
					weapons: savedData.weapons || [],
					armors: savedData.armors || [],
					feats: savedData.feats || [],
					inventory: savedData.inventory || [],
				};
			} else {
				sheet.value = {
					id: tokenId,
					name: item.name || 'Nouveau Personnage',
					species: 'Aucune',
					professionName: '',
					professionDescription: '',
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
				};
			}
		} else {
			selectedTokenId.value = null;
		}
	}

	async function saveSheet() {
		if (!canEdit.value) return;
		const rawData = JSON.parse(JSON.stringify(toRaw(sheet.value)));

		// Utilisation du nom du personnage pour créer une clé globale stable
		const charName = (sheet.value.name || 'personnage').trim().toLowerCase();
		const roomMetadataKey = `character_sheet_${charName}`;

		try {
			// 1. Sauvegarde globale dans la Room (partagée entre toutes les scènes et tous les tokens du même nom)
			await OBR.room.setMetadata({
				[roomMetadataKey]: rawData,
			});

			// 2. Optionnel : On garde aussi une copie sur le token sélectionné s'il existe
			if (selectedTokenId.value) {
				await OBR.scene.items.updateItems([selectedTokenId.value], (items) => {
					for (const item of items) {
						if (!item.metadata) item.metadata = {};
						item.metadata[METADATA_KEY] = rawData;
					}
				});
			}
		} catch (e) {
			console.error('Erreur lors de la sauvegarde de la fiche:', e);
		}
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
		if (!logEntry.isSecret || isGM.value || logEntry.senderId === currentUserId.value) {
			rollLogs.value.unshift(logEntry);
		}
		await OBR.broadcast.sendMessage(BROADCAST_DICE_CHANNEL, logEntry);
		await broadcastDiceRollAsChat(logEntry);

		// Détermination de l'icône de succès / échec pour la notification
		let statusIcon = '';
		if (logEntry.isSuccess === true) {
			statusIcon = '✅ ';
		} else if (logEntry.isSuccess === false) {
			statusIcon = '❌ ';
		}
		// Détermination de critique
		let critStatus = '';
		if (logEntry.isCritSuccess === true) {
			critStatus = ' [CRITIQUE] ';
		} else if (logEntry.isCritFailure === true) {
			critStatus = ' [ÉCHEC CRITIQUE] ';
		}

		// Construction du texte de la notification
		let notifText = `${statusIcon}${critStatus} ${logEntry.characterName} : ${logEntry.label}`;
		if (logEntry.diceResult !== undefined) notifText += ` (Dé : ${logEntry.diceResult})`;

		// Notification selon le caractère secret ou public du jet
		if (!logEntry.isSecret) {
			OBR.notification.show(notifText);
		} else if (isGM.value) {
			// Le MJ voit les lancers secrets de ses joueurs avec une mention explicite
			OBR.notification.show(`🔒 [SECRET] ${notifText}`);
		} else {
			// Pour les joueurs, un jet secret n'affiche pas le détail direct par discrétion
			OBR.notification.show(`🔒 [SECRET] ${logEntry.characterName} a effectué un jet masqué.`);
		}
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
			details: `Formule: ${formula} (${parsed.breakdown})`,
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
			masteryRollBreakdown = ` + Maîtrise ${mRoll.breakdown}`;
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
				masteryRollBreakdown = ` + Maîtrise ${mRoll.breakdown}`;
			}

			totalVal = baseRoll.total + masteryRollTotal + weaponRoll.total;
			detailStr = `${weaponRoll.breakdown} + ${baseRoll.breakdown}${masteryRollBreakdown}`;
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

	function clearLogs() {
		rollLogs.value = [];
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
			if (key.startsWith('character_sheet_') && metadata[key] !== undefined && metadata[key].value !== null) {
				sheets.push(metadata[key]);
			}
		}
		partySheets.value = sheets;
	}

	async function saveCharacter(character: any) {
		const rawData = JSON.parse(JSON.stringify(toRaw(character)));

		// Utilisation du nom du personnage pour créer une clé globale stable
		const charName = (character.name || 'personnage').trim().toLowerCase();
		const roomMetadataKey = `character_sheet_${charName}`;

		// 1. Sauvegarde globale dans la Room (partagée entre toutes les scènes et tous les tokens du même nom)
		await OBR.room.setMetadata({
			[roomMetadataKey]: rawData,
		});
	}

	async function deleteMetadata(character: any, amount: number) {
		// Utilisation du nom du personnage pour créer une clé globale stable
		const charName = (character.name || 'personnage').trim().toLowerCase();
		const roomMetadataKey = `character_sheet_${charName}`;

		const metadata = await OBR.room.getMetadata();

		metadata[roomMetadataKey] = undefined; // Supprime la clé de métadonnées
		await OBR.room.setMetadata(metadata);
	}

	async function focusAndSelectToken(tokenId: string) {
		if (!tokenId) return;

		// 1. Récupérer les données de l'item sur la scène
		const items = await OBR.scene.items.getItems([tokenId]);
		if (items.length === 0) {
			console.warn('Token introuvable sur la scène active.');
			await OBR.player.select([]);
			return;
		}

		const token = items[0];

		// 3. Sélectionner le token
		await OBR.player.select([token.id]);
	}

	return {
		isReady,
		isGM,
		canEdit,
		selectedTokenId,
		sheet,
		roomPlayers,
		rollLogs,
		currentSpeciesData,
		estimatedHpMax,
		estimatedPeMax,
		dodgePenalty,
		protectionPenalty,
		corruptionStatus,
		chatMessages,
		partySheets,
		init,
		saveSheet,
		rollStatCheck,
		rollWeaponAttack,
		rollWeaponDamage,
		rollSpellCast,
		rollSpellEffect,
		rollCustomDice,
		executeFormulaRoll,
		clearLogs,
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
	};
}
