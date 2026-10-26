const bcrypt = require('bcryptjs');

const ROLE_SEEDS = [
  {
    key: 'super_admin',
    name: 'Super Admin',
    description: 'Full access to the platform, user accounts, roles and permissions.'
  },
  {
    key: 'farmer',
    name: 'Farmer',
    description: 'Manages their own harvest listings and conversations with buyers.'
  },
  {
    key: 'buyer',
    name: 'Buyer',
    description: 'Discovers harvests, manages requests and connects with farmers.'
  }
];

const PERMISSION_SEEDS = [
  ['platform:view', 'View platform overview', 'Platform', 'See account, farmer, buyer and marketplace totals.'],
  ['users:view', 'View users', 'Users', 'Open the user directory and profile details.'],
  ['users:create', 'Create users', 'Users', 'Add farmer, buyer or administrator accounts.'],
  ['users:update', 'Edit users', 'Users', 'Update names, phone numbers, email addresses and roles.'],
  ['users:status', 'Manage account status', 'Users', 'Enable, disable, lock or unlock accounts.'],
  ['users:delete', 'Delete users', 'Users', 'Permanently remove user accounts.'],
  ['roles:view', 'View roles', 'Access', 'See every role and the permissions attached to it.'],
  ['roles:manage', 'Manage role permissions', 'Access', 'Change what farmer and buyer roles are allowed to do.'],
  ['permissions:view', 'View permissions', 'Access', 'Browse the full permission catalog.'],
  ['harvests:view', 'View harvests', 'Marketplace', 'See harvest listings across the platform.'],
  ['harvests:manage_own', 'Manage own harvests', 'Marketplace', 'Create and maintain personal harvest listings.'],
  ['harvests:moderate', 'Moderate harvests', 'Marketplace', 'Hide or remove listings that break platform rules.'],
  ['requests:create', 'Create buyer requests', 'Marketplace', 'Post a request for a crop.'],
  ['requests:manage_own', 'Manage own requests', 'Marketplace', 'Update or close personal buyer requests.'],
  ['requests:view', 'View buyer requests', 'Marketplace', 'See requests posted by buyers.'],
  ['messages:send', 'Send messages', 'Marketplace', 'Contact farmers or buyers directly.'],
  ['messages:view', 'View message activity', 'Marketplace', 'Review conversations and platform message activity.']
];

const ROLE_PERMISSION_DEFAULTS = {
  farmer: ['harvests:manage_own', 'requests:create', 'messages:send'],
  buyer: ['harvests:view', 'requests:manage_own', 'messages:send']
};

const DEMO_USERS = [
  {
    key: 'ADMIN',
    role: 'super_admin',
    name: 'Umuhinzi Connect Admin',
    phone: '+250788000003',
    email: 'admin@umuhinziconnect.rw',
    password: 'Admin@2026',
    district: 'Kigali',
    sector: 'Nyarugenge'
  },
  {
    key: 'FARMER',
    role: 'farmer',
    name: 'Aline Mukamana',
    phone: '+250788000001',
    email: 'farmer@umuhinziconnect.rw',
    password: 'Farmer@2026',
    district: 'Musanze',
    sector: 'Muhoza'
  },
  {
    key: 'BUYER',
    role: 'buyer',
    name: 'Eric Nshimiyimana',
    phone: '+250788000002',
    email: 'buyer@umuhinziconnect.rw',
    password: 'Buyer@2026',
    district: 'Kigali',
    sector: 'Gasabo'
  }
];

const cleanOptional = (value) => {
  const trimmed = String(value || '').trim();
  return trimmed ? trimmed : null;
};

async function seedRoles(client) {
  for (const role of ROLE_SEEDS) {
    await client.query(
      `INSERT INTO roles (key, name, description, is_system)
       VALUES ($1, $2, $3, TRUE)
       ON CONFLICT (key) DO UPDATE
         SET name = EXCLUDED.name,
             description = EXCLUDED.description,
             updated_at = NOW()`,
      [role.key, role.name, role.description]
    );
  }
}

async function seedPermissions(client) {
  for (const [key, label, groupName, description] of PERMISSION_SEEDS) {
    await client.query(
      `INSERT INTO permissions (key, label, group_name, description)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (key) DO UPDATE
         SET label = EXCLUDED.label,
             group_name = EXCLUDED.group_name,
             description = EXCLUDED.description`,
      [key, label, groupName, description]
    );
  }
}

async function seedRolePermissions(client) {
  const { rows: roles } = await client.query('SELECT id, key FROM roles');
  const { rows: permissions } = await client.query('SELECT id, key FROM permissions');
  const permissionByKey = new Map(permissions.map((permission) => [permission.key, permission.id]));

  for (const role of roles) {
    if (role.key === 'super_admin') {
      await client.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         SELECT $1, id FROM permissions
         ON CONFLICT (role_id, permission_id) DO NOTHING`,
        [role.id]
      );
      continue;
    }

    const defaults = ROLE_PERMISSION_DEFAULTS[role.key] || [];
    if (defaults.length === 0) continue;

    const { rows } = await client.query(
      'SELECT 1 FROM role_permissions WHERE role_id = $1 LIMIT 1',
      [role.id]
    );
    if (rows.length > 0) continue;

    const permissionIds = defaults.map((key) => permissionByKey.get(key)).filter(Boolean);
    for (const permissionId of permissionIds) {
      await client.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         VALUES ($1, $2)
         ON CONFLICT (role_id, permission_id) DO NOTHING`,
        [role.id, permissionId]
      );
    }
  }
}

function resolveSeedUser(user) {
  const prefix = `SEED_${user.key}`;
  const isProduction = process.env.NODE_ENV === 'production';
  const password = process.env[`${prefix}_PASSWORD`] || (isProduction ? null : user.password);

  return {
    role: user.role,
    name: String(process.env[`${prefix}_NAME`] || user.name).trim(),
    phone: cleanOptional(process.env[`${prefix}_PHONE`] || user.phone),
    email: cleanOptional(process.env[`${prefix}_EMAIL`] || user.email)?.toLowerCase(),
    password,
    district: cleanOptional(process.env[`${prefix}_DISTRICT`] || user.district),
    sector: cleanOptional(process.env[`${prefix}_SECTOR`] || user.sector)
  };
}

async function seedUsers(client) {
  if (String(process.env.SEED_DEMO_USERS || '').toLowerCase() === 'false') return;

  for (const demoUser of DEMO_USERS) {
    const user = resolveSeedUser(demoUser);
    if (!user.phone || !user.password) {
      if (process.env.NODE_ENV === 'production') {
        console.warn(`[seed] Skipped ${user.role}: set ${`SEED_${demoUser.key}_PASSWORD`} to create it.`);
      }
      continue;
    }

    const existing = await client.query(
      `SELECT id FROM users
        WHERE phone = $1 OR ($2::text IS NOT NULL AND LOWER(email) = $2)
        LIMIT 1`,
      [user.phone, user.email]
    );
    if (existing.rows.length > 0) continue;

    const passwordHash = await bcrypt.hash(user.password, 10);
    await client.query(
      `INSERT INTO users (
         full_name, phone, email, password_hash, role, district, sector,
         enabled, account_non_locked
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, TRUE)`,
      [
        user.name,
        user.phone,
        user.email,
        passwordHash,
        user.role,
        user.district,
        user.sector
      ]
    );

    console.log(`[seed] Created ${user.role} account: ${user.phone}`);
  }
}

async function seedDatabase(client) {
  await seedRoles(client);
  await seedPermissions(client);
  await seedRolePermissions(client);
  await seedUsers(client);
}

module.exports = { seedDatabase };
