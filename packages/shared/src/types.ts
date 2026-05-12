export type SiteName = 'caskan' | 'grow' | 'edc' | 'estama';

export interface Site {
  id: string;
  name: SiteName;
  base_url: string;
}

export interface Salon {
  id: string;
  site_id: string;
  site_name: SiteName;
  shop_id: string;
  name: string;
  url: string | null;
}

export interface TherapistRecord {
  therapist_id: string;
  name: string;
  profile_url?: string | null;
  image_url?: string | null;
  description?: string | null;
  age?: number | null;
  height?: number | null;
  bust?: number | null;
  waist?: number | null;
  hip?: number | null;
  cup?: string | null;
}

export interface Therapist {
  id: string;
  salon_id: string;
  salon_shop_id: string;
  site_name: SiteName;
  therapist_id: string;
  name: string;
}

export interface AvailabilityRecord {
  date: string;
  start_time: string;
  is_available: boolean;
}

export interface SalonScraper {
  run(): Promise<Salon[]>;
}

export interface TherapistScraper {
  run(salon: Salon): Promise<TherapistRecord[]>;
}

export interface AvailabilityScraper {
  run(therapist: Therapist): Promise<AvailabilityRecord[]>;
}
