module.exports = {
	up: async knex => {
		return knex.schema
			.alterTable('connections', table => {
				// ask for the mysql password when opening the connection, it is not stored
				table.integer('mysql_password_ask').defaultTo(0);
			});
	},
	down: async knex => {
		return knex.schema
			.alterTable('connections', table => {
				table.dropColumn('mysql_password_ask');
			});
	}
}
