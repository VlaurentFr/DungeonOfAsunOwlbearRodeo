export type StatName = 'force' | 'dexterite' | 'intellect' | 'sagesse';
export type WeaponType = 'Epee' | 'Dague' | 'Arc' | 'Masse' | 'Lance' | 'Magie' | 'Hache' | 'Poing';
export type WeaponRank = 'E' | 'D' | 'C' | 'B' | 'A' | 'S' | 'M' | 'H';

// --- ESPECES ---
export interface SpeciesDetails {
	name: string;
	statBonus: Partial<Record<StatName, number>>;
	talentName: string;
	talentDescription: string;
}

export const SPECIES_DATA: Record<string, SpeciesDetails> = {
	Aucune: { name: 'Aucune', statBonus: {}, talentName: 'Aucun', talentDescription: 'Sélectionnez une espèce.' },
	Valm: {
		name: 'Valm (“Ceux des terres habitées”)',
		statBonus: {},
		talentName: 'Conquérant',
		talentDescription: '+1 dans l Attribut de votre choix. Avantage résistance corruption.',
	},
	Urielar: {
		name: 'Urielar (“Enfants d Uriel”)',
		statBonus: { intellect: 1 },
		talentName: 'Éloquence',
		talentDescription: 'Avantage jets d éloquence.',
	},
	Lythari: {
		name: 'Lythari (“Peuple des feuilles portées par le vent”)',
		statBonus: { dexterite: 1 },
		talentName: 'Œil de Faucon',
		talentDescription: 'Avantage perception.',
	},
	Virelith: {
		name: 'Virelith (“Peuple de la pierre obscure”)',
		statBonus: { force: 1 },
		talentName: 'Nyctalope',
		talentDescription: 'Vision dans le noir.',
	},
	Umiyori: {
		name: 'Umiyori (“Elfe de la mer”)',
		statBonus: { dexterite: 1 },
		talentName: 'Souffle des marées',
		talentDescription: 'Respiration sous l eau 2x plus longue.',
	},
	Morndal: {
		name: 'Morndal (“Habitants des hautes pierres”)',
		statBonus: { force: 1 },
		talentName: 'Alcoolisme',
		talentDescription: 'Avantage constitution.',
	},
	GnomeTirwar: {
		name: 'Gnome de Tirwar (“Les Rats de métal”)',
		statBonus: { sagesse: 1 },
		talentName: 'Réparation',
		talentDescription: 'Double kits de réparation.',
	},
	Kovraks: {
		name: 'Kovraks (“Guerriers de Koven”)',
		statBonus: { force: 1 },
		talentName: 'Résistance Orc',
		talentDescription: 'Avantage intimidation.',
	},
	DraZuun: {
		name: 'Dra’Zuun (“Dragons errants”)',
		statBonus: { sagesse: 1 },
		talentName: 'Volonté du Dragon',
		talentDescription: 'Avantage peur et charme.',
	},
	Vhaerith: {
		name: 'Vhaerith (“Les Cornues”)',
		statBonus: { intellect: 1 },
		talentName: 'Être de magie',
		talentDescription: 'Double potions.',
	},
	Fenghou: {
		name: 'Fenghou (“Singes du vent”)',
		statBonus: { dexterite: 1 },
		talentName: 'Escalades',
		talentDescription: 'Avantage escalade.',
	},
};

// --- DYNAMIQUES ---
export interface WeaponItem {
	id: string;
	name: string;
	damage: string;
	quality: string;
	weaponType: WeaponType;
	stat: StatName;
	description: string;
	favorite?: boolean;
	equipped?: boolean;
}

export interface ArmorItem {
	id: string;
	name: string;
	protection: number;
	dexMalus: number;
	description: string;
	favorite?: boolean;
	equipped?: boolean;
}

export interface SpellItem {
	id: string;
	name: string;
	level: number;
	range: string;
	peCost: number;
	stat: StatName;
	weaponType: WeaponType;
	formula: string;
	description: string;
	favorite?: boolean;
}

export interface FeatItem {
	id: string;
	name: string;
	effect: string;
	favorite?: boolean;
}

export interface InventoryItem {
	id: string;
	name: string;
	quantity: number;
	description: string;
	favorite?: boolean;
	formula?: string;
}

// --- MAITRISES ---
export interface WeaponRankDetails {
	rank: WeaponRank;
	dice: string;
	hitBonus: number;
	bonusCount: number;
	xpRequired: number;
}

export const RANK_TABLE: WeaponRankDetails[] = [
	{ rank: 'H', dice: '+2d12', hitBonus: 4, bonusCount: 5, xpRequired: 400 },
	{ rank: 'M', dice: '+1d20', hitBonus: 3, bonusCount: 4, xpRequired: 275 },
	{ rank: 'S', dice: '+1d12', hitBonus: 3, bonusCount: 3, xpRequired: 180 },
	{ rank: 'A', dice: '+1d10', hitBonus: 2, bonusCount: 2, xpRequired: 110 },
	{ rank: 'B', dice: '+1d8', hitBonus: 2, bonusCount: 1, xpRequired: 65 },
	{ rank: 'C', dice: '+1d6', hitBonus: 1, bonusCount: 0, xpRequired: 35 },
	{ rank: 'D', dice: '+1d4', hitBonus: 1, bonusCount: 0, xpRequired: 15 },
	{ rank: 'E', dice: 'Aucun', hitBonus: 0, bonusCount: 0, xpRequired: 0 },
];

export function getRankFromXp(xp: number): WeaponRankDetails {
	for (const details of RANK_TABLE) {
		if (xp >= details.xpRequired) {
			return details;
		}
	}
	return RANK_TABLE[RANK_TABLE.length - 1];
}

export type WeaponXp = Record<WeaponType, number>;

export interface CharacterStats {
	force: number;
	dexterite: number;
	intellect: number;
	sagesse: number;
}

export interface CharacterSheet {
	id: string;
	name: string;
	species: string;
	professionName?: string; // NOUVEAU : Nom de l'ancien métier
	professionDescription?: string; // NOUVEAU : Description de l'avantage
	ownerIds: string[];
	stats: CharacterStats;
	weaponXp: WeaponXp;
	hpCurrent: number;
	hpMax: number;
	peCurrent: number;
	peMax: number;
	wounds: boolean[];
	corruption: number;
	ec: number;
	spells: SpellItem[];
	weapons: WeaponItem[];
	armors: ArmorItem[];
	feats: FeatItem[];
	inventory: InventoryItem[];
}

export interface RoomPlayer {
	id: string;
	name: string;
	color: string;
	role: 'GM' | 'PLAYER';
}

// --- LOGS ---
export interface DiceRollLog {
	id: string;
	senderId: string; // ID du joueur qui a effectué le lancer
	playerName: string;
	playerColor: string;
	characterName: string;
	label: string;
	statValue?: number;
	diceResult?: number;
	details?: string;
	isSuccess?: boolean;
	isCritSuccess?: boolean;
	isCritFailure?: boolean;
	isSecret?: boolean; // NOUVEAU : Jet secret / réservé au MJ et à l'auteur
	timestamp: string;
}
