import * as React from 'react';
import $ from 'jquery';
import { observer } from 'mobx-react';
import { Title, IconObject, ObjectName, Icon } from 'Component';
import { I, UtilSpace, UtilRouter, translate, UtilMenu } from 'Lib';
import { dbStore, detailStore, authStore } from 'Store';
import Constant from 'json/constant.json';

const PopupSettingsPageSpacesList = observer(class PopupSettingsPageSpacesList extends React.Component<I.PopupSettings> {

	constructor (props) {
		super(props);
	};

	render () {
		const { accountSpaceId } = authStore;
		const spaces = this.getItems();

		const Row = (space: any) => {
			const creator = detailStore.get(Constant.subId.space, space.creator);
			const participant = UtilSpace.getMyParticipant(space.targetSpaceId);
			const isOwner = participant && (participant.permissions == I.ParticipantPermissions.Owner);
			const permissions = participant ? translate(`participantPermissions${participant.permissions}`) : '';
			const hasMenu = space.targetSpaceId != accountSpaceId;

			return (
				<tr>
					<td className="columnSpace">
						<div className="spaceNameWrapper" onClick={() => this.onClick(space)}>
							<IconObject object={space} size={40} />
							<div className="info">
								<ObjectName object={space} />

								{!isOwner && !creator._empty_ ? (
									<div className="creatorNameWrapper">
										<IconObject object={creator} size={16} />
										<ObjectName object={creator} />
									</div>
								) : ''}
							</div>
						</div>
					</td>
					<td>{permissions}</td>
					<td>{translate(`spaceStatus${space.spaceAccountStatus}`)}</td>

					<td className="columnMore">
						{hasMenu ? (
							<div id={`icon-more-${space.id}`} onClick={() => this.onMore(space)} className="iconWrap">
								<Icon className="more" />
							</div>
						) : ''}
					</td>
				</tr>
			);
		};

		return (
			<React.Fragment>
				<Title text={translate('popupSettingsSpacesListTitle')} />

				<div className="items">
					<table>
						<thead>
							<tr>
								<th className="columnSpace">{translate('popupSettingsSpacesListSpace')}</th>
								<th>{translate('popupSettingsSpacesListAccess')}</th>
								<th>{translate('popupSettingsSpacesListNetwork')}</th>
								<th className="columnMore"> </th>
							</tr>
						</thead>
						<tbody>
							{spaces.map((item: any, i: number) => <Row key={i} {...item} />)}
						</tbody>
					</table>
				</div>
			</React.Fragment>
		);
	};

	getItems () {
		const subId = Constant.subId.space;
		const items = dbStore.getRecords(subId, '').map(id => detailStore.get(subId, id));

		return items.filter(it => ![ I.SpaceStatus.Deleted ].includes(it.spaceAccountStatus));
	};

	onClick (space: any) {
		if (space.spaceAccountStatus != I.SpaceStatus.Joining) {
			UtilRouter.switchSpace(space.targetSpaceId);
		};
	};

	onMore (space: any) {
		const { getId } = this.props;
		const element = $(`#${getId()} #icon-more-${space.id}`);

		UtilMenu.spaceContext(space, {
			element,
			vertical: I.MenuDirection.Bottom,
			horizontal: I.MenuDirection.Right,
			offsetY: 4,
			onOpen: () => element.addClass('active'),
			onClose: () => element.removeClass('active'),
			route: 'Settings',
		});
	};

});

export default PopupSettingsPageSpacesList;
