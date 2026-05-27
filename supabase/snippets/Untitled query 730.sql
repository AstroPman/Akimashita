update reviews
set status = 'published',
    reviewed_at = now()
where status = 'pending'