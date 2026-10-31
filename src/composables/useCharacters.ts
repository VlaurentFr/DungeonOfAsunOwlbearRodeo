import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';
import { useCampaign } from './useCampaign';
import type { CharacterSheet } from '../types/character';

interface CharacterRecord {
	id: string;
	version: number;
	data: CharacterSheet;
}

interface SavedVersion {
	id: string;
	version: number;
}

export function useCharacters() {
	const { user } = useAuth();
	const { campaign } = useCampaign();

	// Garde en mémoire l'identifiant Supabase et la version
	// de chaque fiche chargée pendant cette session.
	const savedVersions = new Map<string, SavedVersion>();

	function getContext() {
		if (!user.value) {
			throw new Error('Utilisateur Supabase non connecté.');
		}

		if (!campaign.value) {
			throw new Error('Aucune campagne sélectionnée.');
		}

		return {
			userId: user.value.id,
			campaignId: campaign.value.id,
		};
	}

	async function loadCharacter(legacyId: string): Promise<CharacterRecord | null> {
		const { campaignId } = getContext();

		const { data, error } = await supabase
			.from('characters')
			.select('id, version, data')
			.eq('campaign_id', campaignId)
			.eq('legacy_id', legacyId)
			.maybeSingle();

		if (error) {
			throw new Error(`Erreur de chargement : ${error.message}`);
		}

		if (!data) {
			savedVersions.delete(legacyId);
			return null;
		}

		const record: CharacterRecord = {
			id: data.id,
			version: data.version,
			data: data.data as CharacterSheet,
		};

		savedVersions.set(legacyId, {
			id: record.id,
			version: record.version,
		});

		return record;
	}

	async function listCharacters() {
		const { campaignId } = getContext();

		const { data, error } = await supabase
			.from('characters')
			.select(
				`
    id,
    legacy_id,
    version,
    type,
    name,
    data,
    character_owners(user_id)
  `,
			)
			.eq('campaign_id', campaignId)
			.not('legacy_id', 'is', null);

		if (error) {
			throw new Error(`Erreur de chargement des fiches : ${error.message}`);
		}

		const records = (data ?? []).map((record) => {
			const legacyId = record.legacy_id as string;

			savedVersions.set(legacyId, {
				id: record.id,
				version: record.version,
			});

			return {
				id: record.id,
				legacyId,
				version: record.version,
				type: record.type,
				name: record.name,
				data: record.data as CharacterSheet,
				supabaseOwnerIds: (record.character_owners ?? []).map((owner) => owner.user_id),
			};
		});

		return records;
	}

	async function saveCharacter(legacyId: string, character: CharacterSheet): Promise<void> {
		const { userId, campaignId } = getContext();
		const isPlayerPJ = character.type === 'pj' && campaign.value?.role === 'player';

		let saved = savedVersions.get(legacyId);

		if (!saved) {
			const existing = await loadCharacter(legacyId);

			if (existing) {
				saved = {
					id: existing.id,
					version: existing.version,
				};
			}
		}

		// Enregistre le joueur comme propriétaire de la fiche
		async function assignOwner(characterId: string) {
			if (!isPlayerPJ) return;

			const { error } = await supabase.from('character_owners').upsert(
				{
					character_id: characterId,
					user_id: userId,
				},
				{
					onConflict: 'character_id,user_id',
					ignoreDuplicates: true,
				},
			);

			if (error) {
				throw new Error(`Erreur lors de l'attribution du propriétaire : ${error.message}`);
			}
		}

		if (saved) {
			// S'assure que le joueur est bien associé à sa fiche
			await assignOwner(saved.id);

			const { data, error } = await supabase
				.from('characters')
				.update({
					name: character.name,
					type: character.type,
					data: character,
					updated_by: userId,
				})
				.eq('id', saved.id)
				.eq('version', saved.version)
				.select('id, version')
				.maybeSingle();

			if (error) {
				throw new Error(`Erreur de sauvegarde : ${error.message}`);
			}

			if (!data) {
				throw new Error(
					'Conflit ou droits insuffisants : la fiche a changé depuis son chargement. Recharge-la avant de réessayer.',
				);
			}

			savedVersions.set(legacyId, {
				id: data.id,
				version: data.version,
			});

			return;
		}

		// Création d'une nouvelle fiche
		const { data, error } = await supabase
			.from('characters')
			.insert({
				campaign_id: campaignId,
				legacy_id: legacyId,
				type: character.type,
				name: character.name,
				data: character,
				owner_id: isPlayerPJ ? userId : null,
				created_by: userId,
				updated_by: userId,
			})
			.select('id, version')
			.single();

		if (error) {
			throw new Error(`Erreur de création : ${error.message}`);
		}

		// Associe le joueur à la nouvelle fiche
		await assignOwner(data.id);

		savedVersions.set(legacyId, {
			id: data.id,
			version: data.version,
		});
	}

	async function deleteCharacter(legacyId: string): Promise<void> {
		const { campaignId } = getContext();

		const { error } = await supabase
			.from('characters')
			.delete()
			.eq('campaign_id', campaignId)
			.eq('legacy_id', legacyId);

		if (error) {
			throw new Error(`Erreur lors de la suppression : ${error.message}`);
		}

		savedVersions.delete(legacyId);
	}

	return {
		loadCharacter,
		listCharacters,
		saveCharacter,
		deleteCharacter,
	};
}
