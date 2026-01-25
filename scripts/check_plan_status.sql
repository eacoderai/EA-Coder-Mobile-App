select 
   split_part(key, ':', 2) as user_id, 
   value ->> 'plan' as plan, 
   value ->> 'updatedAt' as updated_at 
 from 
   kv_store_00a119be 
 where 
   key like 'user:%:subscription' 
 order by 
   updated_at desc;
