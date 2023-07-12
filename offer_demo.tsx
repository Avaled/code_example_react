import React, { useRef, useImperativeHandle, useCallback, useState, useMemo, useEffect } from 'react';
import { AxiosError } from 'axios';
import styled from 'styled-components';
import { DialogStateReturn } from 'reakit/ts';
import {
    spacingSm,
    Button,
    colorDarkGrey056,
    colorPrimary,
    iconSize,
    InfoOutlinedIcon,
    spacingXs,
    Input,
    Checkbox,
    colorRed,
    colorGrey4,
    spacingLg,
} from '@/sm-components';
import { CompanyDTO, WorkspaceType } from '@/sm-developer-profile';
import { Resolver, useForm, FormProvider, useFormContext, useController } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { DpOfferSignRqDtoPaymentTypeEnum, DpOfferSignRqDto } from '@/sm-billing';

import { Modal } from '../../../../../../../components/Modal';
import { useTranslations } from '../../../../../../../hooks/useTranslations';
import * as keyset from '../i18n';
import { ButtonGroup, OutlinedButton } from '../../../../../../../features/buttonGroup';
import { StyledFormBlock } from '../../../../../../../pages/SettingsPage/components/workspacePage/components/common';
import { OfferVerificationSchema, getOfferVerificationSchema, getDefaultOfferValues } from '../schema';
import { EVerificationFields } from '../../../../../../../models/ui/billing/verificationParameters';
import { useOfferFieldsPlaceholders } from '../hooks/useOfferFieldsPlaceholders';
import { useOfferFieldsDescriptions } from '../hooks/useOfferFieldsDescriptions';
import { updateOffer, getOfferPdf, getTariff } from '../../../../../../../services/developerProfile/billingService';
import { useSettingsContext, useActionsSettings } from '../../../../../../../pages/SettingsPage/settingsContext';
import { useCompany } from '../../../../../../../queries/company';
import { notify } from '../../../../../../../features/notifications';
import { downloadPdfFromBase64 } from '../../../helpers';
import { VALIDATION_SOLE_PROPRIETOR_INN_LENGTH, VALIDATION_KPP_LENGTH } from '../../../../../../../services/validation';
import { tableBorderRadius } from '../../../../../../../styles/themes';
import { useWorkspaces } from '../../../../../../../queries/workspaces';
import { EAnalyticsEvent } from '../../../../../../../models/enums/EAnalyticsActionLabel';
import { useAnalytics } from '../../../../../../../hooks';
import { DownloadOffer } from '../style';
import { getDefaultBalance } from '../../../schema';

import { ModalContent, Head, Body, ButtonContainer } from './style';

const ModalContentStyle = styled(ModalContent)`
    min-height: 364px;
    width: 551px;
`;

const Notice = styled.div`
    padding: ${spacingSm};
    background-color: ${colorGrey4};
    color: ${colorDarkGrey056};
    margin-bottom: ${spacingLg};
    display: flex;
    align-items: start;
    border-radius: ${tableBorderRadius};
    max-width: 600px;
`;

const NoticeIcon = styled(InfoOutlinedIcon)`
    width: ${iconSize};
    height: ${iconSize};
    color: ${colorPrimary};
    margin-right: ${spacingXs};
`;
const ButtonGroupStyle = styled(ButtonGroup)`
    margin-top: ${spacingSm};
`;

const NoticeStyle = styled(Notice)`
    margin-top: ${spacingSm};
    margin-bottom: 0px;
`;

const ErrorMessage = styled.div`
    color: ${colorRed};
`;

const WrapLabel = styled.label`
    display: flex;
    align-items: center;
`;

const DownloadOfferStyle = styled(DownloadOffer)`
    margin-left: 5px;
`;
const StyledFormBlockStyle = styled(StyledFormBlock)`
    padding-top: 0px;
`;

const StyleForm = styled.form`
    margin-top: 0;
    padding-bottom: 0;
`;
const CreateWorkspaceButton = styled(Button)``;

interface ConfirmModalHandles {
    open(): void;
}

interface Props {
    changeOfferModal(): void;
    workspaceId?: string;
}
interface ProviderProps {
    changeOfferModal(): void;
    company: CompanyDTO | undefined;
    closeModal: () => void;
    workspaceId?: string;
}

interface PropsContainer {
    closeModal: () => void;
    changeOfferModal(): void;
    company: CompanyDTO | undefined;
    workspaceId?: string;
}

export const OfferModal = React.forwardRef<ConfirmModalHandles, Props>(({ changeOfferModal, workspaceId }, ref) => {
    const modalRef = useRef<DialogStateReturn>(null);

    useImperativeHandle(ref, () => ({
        open: () => {
            modalRef.current?.show();
        },
    }));
    const [, , spaceMap] = useWorkspaces({
        withObsolete: false,
        withJivoComponents: true,
    });

    const isWorkspaceTypeBusiness = useMemo(() => {
        return spaceMap[workspaceId!]?.type === WorkspaceType.Business;
    }, [workspaceId, spaceMap]);

    const [, companyQuery] = useCompany(workspaceId!, {
        enabled: isWorkspaceTypeBusiness,
    });

    const closeModal = useCallback(() => {
        modalRef.current?.hide();
    }, []);

    return (
        <>
            <Modal ref={modalRef}>
                {(dialog) => {
                    return (
                        <ProviderContainer
                            company={companyQuery.data}
                            closeModal={closeModal}
                            changeOfferModal={changeOfferModal}
                            workspaceId={workspaceId}
                        />
                    );
                }}
            </Modal>
        </>
    );
});
const ProviderContainer: React.FC<ProviderProps> = ({ changeOfferModal, company, closeModal, workspaceId }) => {
    const defaultValues = useMemo(() => getDefaultOfferValues(company), [company]);

    const resolver: Resolver<OfferVerificationSchema> = useMemo(() => yupResolver(getOfferVerificationSchema()), []);

    const form = useForm<OfferVerificationSchema>({
        mode: 'onChange',
        resolver,
        defaultValues,
        shouldUnregister: false,
    });

    return (
        <FormProvider {...form}>
            <VerificationTabFormContainer
                closeModal={closeModal}
                changeOfferModal={changeOfferModal}
                company={company}
                workspaceId={workspaceId}
            />
        </FormProvider>
    );
};

const VerificationTabFormContainer: React.FC<PropsContainer> = ({
    closeModal,
    changeOfferModal,
    company,
    workspaceId,
}) => {
    const [tr] = useTranslations(keyset);
    const { offer } = useSettingsContext();
    const { setIsSigned } = useActionsSettings();
    const [isKPPDisable, setIsKPPDisable] = useState<boolean>(false);
    const { id } = offer;
    const [type, setType] = useState<DpOfferSignRqDtoPaymentTypeEnum>(DpOfferSignRqDtoPaymentTypeEnum.Card);
    const {
        register,
        errors,
        handleSubmit,
        formState,
        trigger,
        reset,
        watch,
    } = useFormContext<OfferVerificationSchema>();
    const { setBalances } = useActionsSettings();
    const fieldPlaceholders = useOfferFieldsPlaceholders();
    const fieldDescriptions = useOfferFieldsDescriptions();
    const analytics = useAnalytics();

    const watchINN = watch([EVerificationFields.INN]);

    useEffect(() => {
        (async () => {
            // обертка необходима, тк функции reset и trigger обрабатываються не в корректном порядке.
            const { inn } = watchINN;
            setIsKPPDisable(inn.length === VALIDATION_SOLE_PROPRIETOR_INN_LENGTH);

            if (inn.length === VALIDATION_SOLE_PROPRIETOR_INN_LENGTH) {
                await reset({ [EVerificationFields.KPP]: '', [EVerificationFields.INN]: inn });
                trigger([EVerificationFields.INN, EVerificationFields.KPP]);
            }
        })();
        // DOTO если мы добавим watchINN , то это будет вызывать бесконечный рендор
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [watchINN.inn, reset, trigger]);

    const {
        field: { onChange: onStatusControllerChange },
    } = useController<OfferVerificationSchema>({
        name: EVerificationFields.BusinesStatus,
        defaultValue: type,
    });
    const selectStatus = useCallback(
        (status: DpOfferSignRqDtoPaymentTypeEnum) => {
            status === DpOfferSignRqDtoPaymentTypeEnum.Card
                ? reset({ [EVerificationFields.INN]: '', [EVerificationFields.KPP]: '' })
                : reset(getDefaultOfferValues(company));

            onStatusControllerChange(status);
            setType(status);
            trigger([EVerificationFields.INN, EVerificationFields.KPP]);
        },
        [onStatusControllerChange, trigger, company, reset],
    );
    const onCloseModal = useCallback(() => {
        analytics.click(EAnalyticsEvent.BillingCloseOffer, 'billing-close-offer');
        closeModal();
    }, [analytics, closeModal]);

    const downloadPDF = useCallback(async () => {
        try {
            const { pdf, fileName } = await getOfferPdf(id!);
            downloadPdfFromBase64(pdf, fileName);
        } catch (e) {
            notify({
                message: (e as AxiosError)?.response?.data.message ?? tr('Что-то пошло не так'),
            });
        }
    }, [tr, id]);

    const onSubmit = async (data: CompanyDTO) => {
        const requst: DpOfferSignRqDto = {
            kpp: data.kpp || undefined,
            inn: data.inn,
            offerId: id,
            paymentType: type,
        };
        try {
            await updateOffer(workspaceId!, requst);
            const { balances } = await getTariff(workspaceId!);
            setBalances(getDefaultBalance(balances));
            closeModal();
            analytics.tech(EAnalyticsEvent.BillingChoiceOffer, 'billing-choice-offer', '');
        } catch (e) {
            notify({
                message: (e as AxiosError)?.response?.data.message ?? tr('Что-то пошло не так'),
            });
        }
    };

    return (
        <ModalContentStyle>
            <StyleForm onSubmit={handleSubmit(onSubmit)}>
                <Head>{tr('Для подключения тарифа необходимо принять условия оферты')}</Head>
                <Body>
                    <ButtonGroupStyle
                        ButtonComponent={OutlinedButton}
                        buttons={[
                            {
                                children: tr('Физлицо'),
                                size: 's',
                                view: 'flatten',
                                onClick: () => selectStatus(DpOfferSignRqDtoPaymentTypeEnum.Card),
                                $inactive: type !== DpOfferSignRqDtoPaymentTypeEnum.Card,
                            },
                            {
                                children: tr('Юрлицо'),
                                size: 's',
                                view: 'flatten',
                                onClick: () => selectStatus(DpOfferSignRqDtoPaymentTypeEnum.Bill),
                                $inactive: type === DpOfferSignRqDtoPaymentTypeEnum.Card,
                            },
                        ]}
                    />
                    {type === DpOfferSignRqDtoPaymentTypeEnum.Bill ? (
                        <div>
                            <StyledFormBlock
                                fieldName={EVerificationFields.INN}
                                description={fieldDescriptions.inn}
                                size="s"
                            >
                                <Input
                                    ref={register()}
                                    name={EVerificationFields.INN}
                                    error={errors.inn?.message}
                                    placeholder={fieldPlaceholders.inn}
                                    limit={VALIDATION_SOLE_PROPRIETOR_INN_LENGTH}
                                    autoComplete="off"
                                    autoCapitalize="off"
                                />
                            </StyledFormBlock>

                            <StyledFormBlockStyle
                                fieldName={EVerificationFields.KPP}
                                description={fieldDescriptions.kpp}
                                size="s"
                            >
                                <Input
                                    ref={register()}
                                    name={EVerificationFields.KPP}
                                    error={errors.kpp?.message}
                                    placeholder={fieldPlaceholders.kpp}
                                    readOnly={isKPPDisable}
                                    limit={VALIDATION_KPP_LENGTH}
                                    autoComplete="off"
                                    autoCapitalize="off"
                                />
                            </StyledFormBlockStyle>
                        </div>
                    ) : null}

                    <NoticeStyle className="footnote-2">
                        <NoticeIcon />
                        <p>
                            {type !== DpOfferSignRqDtoPaymentTypeEnum.Card
                                ? tr('Выбор юрлица означает')
                                : tr('Выбор физлица означает')}
                        </p>
                    </NoticeStyle>
                    <StyledFormBlock fieldName={EVerificationFields.RequiredPayments} size="s">
                        <WrapLabel htmlFor="сheck">
                            <Checkbox
                                label={tr('Я принимаю')}
                                id="сheck"
                                name={EVerificationFields.RequiredPayments}
                                ref={register()}
                            />
                            <DownloadOfferStyle href="#" onClick={downloadPDF}>
                                {tr('условия соглашения')}
                            </DownloadOfferStyle>
                        </WrapLabel>
                        <ErrorMessage>{errors.requiredPayments?.message}</ErrorMessage>
                    </StyledFormBlock>
                </Body>
                <ButtonContainer>
                    <CreateWorkspaceButton
                        view="primary"
                        size="m"
                        disabled={!formState.isValid}
                        type="submit"
                        progress={formState.isSubmitting}
                    >
                        {tr('Подключить')}
                    </CreateWorkspaceButton>
                    <Button size="m" type="button" onClick={onCloseModal}>
                        {tr('Позже')}
                    </Button>
                </ButtonContainer>
            </StyleForm>
        </ModalContentStyle>
    );
};
