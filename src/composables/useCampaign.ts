import { ref } from 'vue';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

interface Campaign {
	id: string;
	name: string;
	role: 'gm' | 'player';
}

const campaign = ref<Campaign | null>(null);
const isLoading = ref(false);
const campaignError = ref<string | null>(null);

export function useCampaign() {
	const { user } = useAuth();

	async function loadCampaign() {
		if (!user.value) {
			campaign.value = null;
			return;
		}

		isLoading.value = true;
		campaignError.value = null;

		const { data, error } = await supabase
			.from('campaign_members')
			.select(
				`
                role,
                campaigns (
                    id,
                    name
                )
            `,
			)
			.eq('user_id', user.value.id);

		if (error) {
			campaignError.value = error.message;
			isLoading.value = false;
			return;
		}

		if (!data || data.length === 0) {
			campaign.value = null;
			campaignError.value = 'Aucune campagne associée à ce compte.';
			isLoading.value = false;
			return;
		}

		if (data.length > 1) {
			campaign.value = null;
			campaignError.value = 'Plusieurs campagnes associées. La sélection sera ajoutée ultérieurement.';
			isLoading.value = false;
			return;
		}

		const membership = data[0];
		const linkedCampaign = membership.campaigns as unknown as {
			id: string;
			name: string;
		};

		campaign.value = {
			id: linkedCampaign.id,
			name: linkedCampaign.name,
			role: membership.role as 'gm' | 'player',
		};

		isLoading.value = false;
	}

	return {
		campaign,
		isLoading,
		campaignError,
		loadCampaign,
	};
}
