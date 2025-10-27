-- Create campus locations table
CREATE TABLE public.campus_locations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.campus_locations ENABLE ROW LEVEL SECURITY;

-- Create policy for public read access (no user accounts needed)
CREATE POLICY "Campus locations are publicly viewable" 
ON public.campus_locations 
FOR SELECT 
USING (true);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
NEW.updated_at = now();
RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_campus_locations_updated_at
BEFORE UPDATE ON public.campus_locations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert sample campus locations
INSERT INTO public.campus_locations (name, category, latitude, longitude, description) VALUES
('Main Library', 'academic', 40.7589, -73.9851, 'Central library with extensive research facilities and study spaces'),
('Student Union Building', 'student-services', 40.7580, -73.9845, 'Hub for student activities, dining, and administrative services'),
('Science Complex', 'academic', 40.7595, -73.9840, 'State-of-the-art laboratories and lecture halls for STEM programs'),
('Engineering Building', 'academic', 40.7585, -73.9835, 'Advanced workshops and computer labs for engineering students'),
('Residence Hall A', 'housing', 40.7575, -73.9860, 'Modern dormitory with suite-style accommodations'),
('Residence Hall B', 'housing', 40.7570, -73.9855, 'Traditional residence hall with shared common areas'),
('Campus Cafeteria', 'dining', 40.7582, -73.9848, 'Main dining facility with diverse food options'),
('Coffee Shop', 'dining', 40.7588, -73.9842, 'Casual coffee and light meals between classes'),
('Gymnasium', 'recreation', 40.7592, -73.9865, 'Full-service fitness center and sports facilities'),
('Tennis Courts', 'recreation', 40.7598, -73.9870, 'Outdoor tennis courts available for student use'),
('Administration Building', 'administrative', 40.7578, -73.9838, 'Main administrative offices and registrar services'),
('Health Center', 'services', 40.7587, -73.9868, 'Campus medical services and wellness programs');