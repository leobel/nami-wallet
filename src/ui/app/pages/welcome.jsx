import React from 'react';
import { Button } from '@chakra-ui/button';
import { Backpack } from 'react-kawaii';
import { Image } from '@chakra-ui/react';
import { useHistory } from 'react-router-dom';
import {
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
} from '@chakra-ui/modal';
import { Box, Spacer, Text, Link } from '@chakra-ui/layout';
import { useDisclosure } from '@chakra-ui/hooks';
import { Select } from '@chakra-ui/select';

import Banner from '../../../assets/img/banner.svg';

const Welcome = ({ data }) => {
  const history = useHistory();
  const refWallet = React.useRef();
  const refImport = React.useRef();

  return (
    <>
      <Box
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
        }}
        position="relative"
      >
        {/* Header */}
        <Box position="absolute" top="9">
          <Image draggable={false} width="100px" src={Banner} />
        </Box>
        {/* Footer */}
        <Box position="absolute" bottom="3">
          <Link color="GrayText">namiwallet.io</Link>
        </Box>
        <Box h="12" />
        <Text fontWeight="bold" fontSize="3xl">
          Welcome,
        </Text>
        <Text
          fontWeight="thin"
          fontSize="sm"
          textAlign="center"
          lineHeight="1.2"
        >
          let's get started with creating a wallet.
        </Text>
        <Box h="8" />
        <Backpack size={120} mood="blissful" color="#61DDBC" />
        <Box height="8" />
        <Button
          onClick={() => {
            refWallet.current.openModal();
          }}
          colorScheme="teal"
          size="md"
        >
          New Wallet
        </Button>
        <Box height="4" />
        <Button
          onClick={() => {
            refImport.current.openModal();
          }}
          colorScheme="orange"
          size="sm"
        >
          Import
        </Button>
      </Box>
      <WalletModal ref={refWallet} />
      <ImportModal ref={refImport} />
    </>
  );
};

const WalletModal = React.forwardRef((props, ref) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const history = useHistory();

  React.useImperativeHandle(ref, () => ({
    openModal() {
      onOpen();
    },
  }));
  return (
    <Modal size="xs" isOpen={isOpen} onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Create a wallet</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Text fontSize="sm">
            Make sure no one is watching the screen, while the seed phrase is
            visible.
          </Text>
        </ModalBody>

        <ModalFooter>
          <Button mr={3} variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button
            colorScheme="teal"
            onClick={() => history.push('/createWallet/generate')}
          >
            Continue
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
});

const ImportModal = React.forwardRef((props, ref) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const history = useHistory();
  const [select, setSelect] = React.useState(null);

  React.useImperativeHandle(ref, () => ({
    openModal() {
      onOpen();
    },
  }));
  return (
    <Modal size="xs" isOpen={isOpen} onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Import a wallet</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Text fontSize="sm">
            Make sure no one is watching the screen, while the seed phrase is
            visible.
          </Text>
          <Spacer height="6" />
          <Select
            onChange={(e) => setSelect(e.target.value)}
            placeholder="Choose seed phrase length"
          >
            <option value="15">15-word seed phrase</option>
            <option value="24">24-word seed phrase</option>
          </Select>
        </ModalBody>

        <ModalFooter>
          <Button mr={3} variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button
            isDisabled={!select}
            colorScheme="teal"
            onClick={() =>
              history.push({
                pathname: '/createWallet/import',
                seedLength: parseInt(select),
              })
            }
          >
            Continue
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
});

export default Welcome;
