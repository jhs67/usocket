{
	'targets': [
		{
			'target_name': 'uwrap',
			'sources': [
				'src/uwrap.cc',
			],
			'cflags': [
				'-Wall',
			],
			'include_dirs' : [
				"<!(node -e \"require('nan')\")"
			],
		},
	],
}
